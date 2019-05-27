import * as admin from "firebase-admin";
import {BeeHive} from "../../../src/app/common/models/beehive.model";
import {BeeKeeper, SerializedBeeKeeper} from "../../../src/app/common/models/beekeeper.model";
import {BeekeeperUtils} from "../utils/beekeeper.utils";
import {Dispatcher} from "./dispatchers/dispatcher.interface";
import {environment} from "../../../src/environments/environment";
import {HiveManager} from "../common/hive/utils/HiveManager.utils";


/**
 * Notifies BeeKeepers about BeeHives that are new or have been declined
 * by previous BeeKeepers. When instantiating, pass a list of Dispatchers
 * that should be used to spread the word.
 */
export class HiveNotifier {

  private readonly dispatchers: Dispatcher[];

  public constructor(dispatchers: Dispatcher[]) {
    this.dispatchers = dispatchers;
  }

  private getClosestToHive(hive: BeeHive): Promise<BeeKeeper> {

    return new Promise<BeeKeeper>((succ, err) => {

      admin.firestore().collection('beekeeper').get().then(
        serializedKeepers => {

          const keepers: BeeKeeper[] = [];

          for (const serializedKeeper of serializedKeepers.docs) {
            keepers.push(new BeeKeeper(<SerializedBeeKeeper>{id: serializedKeeper.id, ...serializedKeeper.data()}));
          }

          const closest = BeekeeperUtils.selectClosestToHive(keepers, hive);

          if (closest) {
            succ(closest);
          } else {
            err(false);
          }
        }
      ).catch(() => {
        console.error('Failed to get beekeeper list')
      });
    });
  }

  /**
   * Sends a message via all Dispatchers the notifier was instantiated with.
   *
   * @param subject Subject of the message
   * @param body Text content of the message
   * @param recipient Recipient (currently only BeeKeepers), could be replaced with a more general interface (e.g. «User», ...)
   * @param extraPayload Extra payload as dict for message
   */
  private sendMessage(recipient: BeeKeeper, subject: string, body: string, extraPayload: any) {
    for (const dispatcher of this.dispatchers) {
      dispatcher.dispatchMessage(recipient, subject, body, extraPayload);
    }
  }

  /**
   * Uses a BeekeeperService to find the closest BeeKeeper to a given BeeHive and
   * notifies them about the hive.
   *
   * @param hive BeeHive Beekeepers should be notified about
   */
  public notifyClosestBeekeeper(hive: BeeHive): boolean {

    console.info('Notifying closest beekeeper about Hive ' + hive.id);

    this.getClosestToHive(hive).then(closestBeekeeper => {

      HiveManager.createOrUpdateClaim(hive, closestBeekeeper)
        .then(hiveClaim => {

          // TODO: i18n
          this.sendMessage(
            closestBeekeeper,
            'Neuen Bienenschwarm gefunden!',
            'Es wurde ein neuer Bienenschwarm in deiner Nähe gemeldet. Jetzt anschauen und beanspruchen!',
            {
              link: environment.baseUrl + '/hive/' + hive.id + '?token=' + hiveClaim.token
            }
          );
        })
        .catch(error => {
          console.error('Unable to create Claim due to the following error: ' + error)
        })

    }).catch(err => {
      console.warn('No Beekeepers available for Hive ' + hive.id);
      return false;
    });

    return true;
  }
}
