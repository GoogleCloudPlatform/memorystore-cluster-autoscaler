/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/*
 * Manages the Autoscaler persistent state
 *
 * By default, this implementation uses a Firestore instance in the same
 * project as the Memorystore Cluster. To use a different project, set the
 * `stateProjectId` parameter in the Cloud Scheduler configuration.
 *
 * To use another database to save autoscaler state, set the
 * `stateDatabase.name` parameter in the Cloud Scheduler configuration.
 * The default database is Firestore.
 */

const firestore = require('@google-cloud/firestore');
const spanner = require('@google-cloud/spanner');
const {logger} = require('../../autoscaler-common/logger');
const assertDefined = require('../../autoscaler-common/assert-defined');
const {memoize} = require('lodash');

/**
 * @typedef {import('../../autoscaler-common/types')
 *   .AutoscalerMemorystoreCluster} AutoscalerMemorystoreCluster
 * @typedef {import('../../autoscaler-common/types').StateDatabaseConfig
 * } StateDatabaseConfig
 */

/**
 * @typedef StateData
 * @property {number?} lastScalingCompleteTimestamp - when the last scaling operation completed.
 * @property {string?} scalingOperationId - the ID of the currently in progress scaling operation.
 * @property {number?} scalingRequestedSize - the requested size of the currently in progress scaling operation.
 *                                          - the requested size is not returned in the LRO, so we keep a note of it here.
 * @property {number?} scalingPreviousSize - the size of the cluster before the currently in progress scaling operation started.
 * @property {string?} scalingMethod - the scaling method used to calculate the size for the currently in progress scaling operation.
 * @property {number} lastScalingTimestamp - when the last scaling operation was started.
 * @property {number} createdOn - the timestamp when this record was created
 * @property {number} updatedOn - the timestamp when this record was updated.
 */

/** @typedef {{name: string, type: string}} ColumnDef */
/** @type {Array<ColumnDef>} */
const STATE_KEY_DEFINITIONS = [
  {name: 'lastScalingTimestamp', type: 'timestamp'},
  {name: 'createdOn', type: 'timestamp'},
  {name: 'updatedOn', type: 'timestamp'},
  {name: 'lastScalingCompleteTimestamp', type: 'timestamp'},
  {name: 'scalingOperationId', type: 'string'},
  {name: 'scalingRequestedSize', type: 'number'},
  {name: 'scalingPreviousSize', type: 'number'},
  {name: 'scalingMethod', type: 'string'},
];

/**
 * Used to store state of a cluster
 */
class State {
  /**
   * Build a State object for the given configuration
   *
   * @param {AutoscalerMemorystoreCluster} cluster
   * @return {State}
   */
  static buildFor(cluster) {
    if (!cluster) {
      throw new Error('cluster should not be null');
    }
    switch (cluster?.stateDatabase?.name) {
      case 'firestore':
        return new StateFirestore(cluster);
      case 'spanner':
        return new StateSpanner(cluster);
      default:
        return new StateFirestore(cluster);
    }
  }

  /**
   * @constructor
   * @protected
   * @param {AutoscalerMemorystoreCluster} cluster
   */
  constructor(cluster) {
    /** @type {string} */
    this.stateProjectId =
      cluster.stateProjectId != null
        ? cluster.stateProjectId
        : cluster.projectId;
    this.projectId = cluster.projectId;
    this.regionId = cluster.regionId;
    this.clusterId = cluster.clusterId;
  }

  /**
   * Initialize value in storage
   * @return {Promise<*>}
   */
  async init() {
    throw new Error('Not implemented');
  }

  /**
   * Get scaling timestamp from storage
   *
   * @return {Promise<StateData>}
   */
  async get() {
    throw new Error('Not implemented');
  }

  /**
   * Update state data in storage with the given values
   * @param {StateData} stateData
   */
  async updateState(stateData) {
    throw new Error('Not implemented');
  }

  /**
   * Close storage
   */
  async close() {
    throw new Error('Not implemented');
  }

  /**
   * Get current timestamp in millis.
   *
   * @return {number};
   */
  get now() {
    return Date.now();
  }

  /**
   * @return {string} full ID for this cluster
   */
  getClusterId() {
    return `projects/${this.projectId}/regions/${this.regionId}/clusters/${this.clusterId}`;
  }
}

module.exports = State;

/**
 * Manages the Autoscaler persistent state in spanner.
 *
 * To manage the Autoscaler state in a spanner database,
 * set the `stateDatabase.name` parameter to 'spanner' in the Cloud Scheduler
 * configuration. The following is an example.
 *
 * {
 *   "stateDatabase": {
 *       "name":       "spanner",
 *       "instanceId": "autoscale-test", // your instance id
 *       "databaseId": "my-database"     // your database id
 *   }
 * }
 */
class StateSpanner extends State {
  /**
   * Builds a Spanner DatabaseClient from parameters in spanner.stateDatabase
   * @param {string} stateProjectId
   * @param {StateDatabaseConfig} stateDatabase
   * @return {spanner.Database}
   */
  static createSpannerDatabaseClient(stateProjectId, stateDatabase) {
    const spannerClient = new spanner.Spanner({projectId: stateProjectId});
    const instance = spannerClient.instance(
      assertDefined(stateDatabase.instanceId),
    );
    return instance.database(assertDefined(stateDatabase.databaseId));
  }

  /**
   * Builds a Spanner database path - used as the key for memoize
   * @param {string} stateProjectId
   * @param {StateDatabaseConfig} stateDatabase
   * @return {string}
   */
  static getStateDatabasePath(stateProjectId, stateDatabase) {
    return `projects/${stateProjectId}/instances/${stateDatabase.instanceId}/databases/${stateDatabase.databaseId}`;
  }

  /**
   * Memoize createSpannerDatabseClient() so that we only create one Spanner
   * database client for each database ID.
   */
  static getSpannerDatabaseClient = memoize(
    StateSpanner.createSpannerDatabaseClient,
    StateSpanner.getStateDatabasePath,
  );

  /**
   * @param {AutoscalerMemorystoreCluster} cluster
   */
  constructor(cluster) {
    super(cluster);
    if (!cluster.stateDatabase) {
      throw new Error('stateDatabase is not defined in Spanner config');
    }
    this.stateDatabase = cluster.stateDatabase;

    /** @type {spanner.Database} */
    const databaseClient = StateSpanner.getSpannerDatabaseClient(
      this.stateProjectId,
      this.stateDatabase,
    );
    this.table = databaseClient.table('memorystoreClusterAutoscaler');
  }

  /** @inheritdoc */
  async init() {
    /** @type {StateData} */
    const data = {
      createdOn: this.now,
      updatedOn: this.now,
      lastScalingTimestamp: 0,
      lastScalingCompleteTimestamp: 0,
      scalingOperationId: null,
      scalingRequestedSize: null,
      scalingMethod: null,
      scalingPreviousSize: null,
    };
    await this.writeToSpanner(StateSpanner.convertToStorage(data));
    // Need to return storage-format data which uses Date objects
    return {
      createdOn: new Date(data.createdOn),
      updatedOn: new Date(data.updatedOn),
      lastScalingTimestamp: new Date(0),
      lastScalingCompleteTimestamp: new Date(0),
      scalingOperationId: null,
    };
  }

  /** @inheritdoc */
  async get() {
    try {
      const query = {
        columns: STATE_KEY_DEFINITIONS.map((c) => c.name),
        keySet: {keys: [{values: [{stringValue: this.getClusterId()}]}]},
      };

      const [rows] = await this.table.read(query);
      if (rows.length == 0) {
        return StateSpanner.convertFromStorage(await this.init());
      }
      return StateSpanner.convertFromStorage(rows[0].toJSON());
    } catch (e) {
      logger.fatal({
        message: `Failed to read from Spanner State storage: ${StateSpanner.getStateDatabasePath(this.stateProjectId, this.stateDatabase)}/tables/${this.table.name}: ${e}`,
        err: e,
      });
      throw e;
    }
  }

  /** @inheritdoc */
  async close() {}

  /**
   * Converts row data from Spanner.timestamp (implementation detail)
   * to standard JS timestamps, which are number of milliseconds since Epoch
   * @param {*} rowData cluster data
   * @return {StateData} converted rowData
   */
  static convertFromStorage(rowData) {
    /** @type {{[x:string] : any}} */
    const ret = {};

    const rowDataKeys = Object.keys(rowData);

    for (const colDef of STATE_KEY_DEFINITIONS) {
      if (rowDataKeys.includes(colDef.name)) {
        // copy value
        ret[colDef.name] = rowData[colDef.name];
        if (rowData[colDef.name] instanceof Date) {
          ret[colDef.name] = rowData[colDef.name].getTime();
        }
      } else {
        // value not present in storage
        if (colDef.type === 'timestamp') {
          ret[colDef.name] = 0;
        } else {
          ret[colDef.name] = null;
        }
      }
    }
    return /** @type {StateData} */ (ret);
  }

  /**
   * Convert StateData to a row object only containing defined spanner
   * columns, including converting timestamps.
   *
   * @param {StateData} stateData
   * @return {*} Spanner row
   */
  static convertToStorage(stateData) {
    /** @type {{[x:string]: any}} */
    const row = {};

    const stateDataKeys = Object.keys(stateData);

    // Only copy values into row that have defined column names.
    for (const colDef of STATE_KEY_DEFINITIONS) {
      if (stateDataKeys.includes(colDef.name)) {
        // copy value
        // @ts-ignore
        row[colDef.name] = stateData[colDef.name];

        // convert timestamp
        if (colDef.type === 'timestamp' && row[colDef.name] !== null) {
          // convert millis to ISO timestamp
          row[colDef.name] = new Date(row[colDef.name]).toISOString();
        }
      }
    }
    return row;
  }

  /**
   * Update state data in storage with the given values
   * @param {StateData} stateData
   */
  async updateState(stateData) {
    stateData.updatedOn = this.now;
    const row = StateSpanner.convertToStorage(stateData);

    // we never want to update createdOn
    delete row.createdOn;

    await this.writeToSpanner(row);
  }

  /**
   * Write the given row to spanner, retrying with the older
   * schema if a column not found error is returned.
   * @param {*} row
   */
  async writeToSpanner(row) {
    try {
      row.id = this.getClusterId();
      await this.table.upsert(row);
    } catch (e) {
      logger.fatal({
        msg: `Failed to write to Spanner State storage: ${StateSpanner.getStateDatabasePath(this.stateProjectId, this.stateDatabase)}/tables/${this.table.name}: ${e}`,
        err: e,
      });
      throw e;
    }
  }
}

/**
 * Manages the Autoscaler persistent state in firestore.
 *
 * The default database for state management is firestore.
 * It is also possible to manage with firestore
 * by explicitly setting `stateDatabase.name` to 'firestore'.
 * The following is an example.
 *
 * {
 *   "stateDatabase": {
 *       "name": "firestore"
 *   }
 * }
 */
class StateFirestore extends State {
  /**
   * Builds a Firestore client for the given project ID
   * @param {string} stateProjectId
   * @param {string} stateDatabaseId
   * @return {firestore.Firestore}
   */
  static createFirestoreClient(stateProjectId, stateDatabaseId) {
    return new firestore.Firestore({
      projectId: stateProjectId,
      databaseId: stateDatabaseId,
    });
  }

  /**
   * Builds a Firestore database path - used as the key for memoize
   * @param {string} stateProjectId
   * @param {string} stateDatabaseId
   * @return {string}
   */
  static getStateDatabasePath(stateProjectId, stateDatabaseId) {
    return `projects/${stateProjectId}/databases/${stateDatabaseId}`;
  }

  /**
   * Memoize createFirestoreClient() so that we only create one Firestore
   * client for each stateProject
   */
  static getFirestoreClient = memoize(
    StateFirestore.createFirestoreClient,
    StateFirestore.getStateDatabasePath,
  );

  /**
   * @param {AutoscalerMemorystoreCluster} cluster
   */
  constructor(cluster) {
    super(cluster);
    this.stateDatabaseId = cluster.stateDatabase?.databaseId || '(default)';
    this.firestore = StateFirestore.getFirestoreClient(
      this.stateProjectId,
      this.stateDatabaseId,
    );
  }

  /**
   * build or return the document reference
   * @return {firestore.DocumentReference}
   */
  get docRef() {
    if (this._docRef == null) {
      this._docRef = this.firestore.doc(
        `memorystoreClusterAutoscaler/state/${this.getClusterId()}`,
      );
    }
    return this._docRef;
  }

  /**
   * Converts document data from Firestore.Timestamp (implementation detail)
   * to standard JS timestamps, which are number of milliseconds since Epoch
   * https://googleapis.dev/nodejs/firestore/latest/Timestamp.html
   * @param {*} docData
   * @return {StateData} converted docData
   */
  static convertFromStorage(docData) {
    /** @type {{[x:string]: any}} */
    const ret = {};

    const docDataKeys = Object.keys(docData);

    // Copy values into row that are present and are known keys.
    for (const colDef of STATE_KEY_DEFINITIONS) {
      if (docDataKeys.includes(colDef.name)) {
        ret[colDef.name] = docData[colDef.name];
        if (docData[colDef.name] instanceof firestore.Timestamp) {
          ret[colDef.name] = docData[colDef.name].toMillis();
        }
      } else {
        // not present in doc:
        if (colDef.type === 'timestamp') {
          ret[colDef.name] = 0;
        } else {
          ret[colDef.name] = null;
        }
      }
    }
    return /** @type {StateData} */ (ret);
  }

  /**
   * Convert StateData to an object only containing defined
   * columns, including converting timestamps from millis to Firestore.Timestamp
   *
   * @param {*} stateData
   * @return {*}
   */
  static convertToStorage(stateData) {
    /** @type {{[x:string]: any}} */
    const doc = {};

    const stateDataKeys = Object.keys(stateData);

    // Copy values into row that are present and are known keys.
    for (const colDef of STATE_KEY_DEFINITIONS) {
      if (stateDataKeys.includes(colDef.name)) {
        if (colDef.type === 'timestamp') {
          // convert millis to Firestore timestamp
          doc[colDef.name] = firestore.Timestamp.fromMillis(
            stateData[colDef.name],
          );
        } else {
          // copy value
          doc[colDef.name] = stateData[colDef.name];
        }
      }
    }
    // we never want to update createdOn
    delete doc.createdOn;

    return doc;
  }

  /** @inheritdoc */
  async init() {
    const initData = {
      createdOn: firestore.Timestamp.fromMillis(this.now),
      updatedOn: firestore.Timestamp.fromMillis(this.now),
      lastScalingTimestamp: firestore.Timestamp.fromMillis(0),
      lastScalingCompleteTimestamp: firestore.Timestamp.fromMillis(0),
      scalingOperationId: null,
      scalingRequestedSize: null,
      scalingPreviousSize: null,
      scalingMethod: null,
    };

    await this.docRef.set(initData);
    return initData;
  }

  /** @inheritdoc */
  async get() {
    const snapshot = await this.docRef.get(); // returns QueryDocumentSnapshot

    let data;
    if (!snapshot.exists) {
      data = await this.init();
    } else {
      data = snapshot.data();
    }

    return StateFirestore.convertFromStorage(data);
  }

  /**
   * Update state data in storage with the given values
   * @param {StateData} stateData
   */
  async updateState(stateData) {
    stateData.updatedOn = this.now;

    const doc = StateFirestore.convertToStorage(stateData);

    // we never want to update createdOn
    delete doc.createdOn;

    await this.docRef.update(doc);
  }

  /** @inheritdoc */
  async close() {}
}
