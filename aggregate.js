import { Meteor } from "meteor/meteor";
import { Mongo } from "meteor/mongo";

const defaultOptions = ({ collection, options }) => ({
  observeSelector: {},
  observeOptions: {},
  delay: 250,
  lookupCollections: {},
  clientCollection: collection._name,
  ...options,
});

export const ReactiveAggregate = function (subscription, collection, pipeline = [], options = {}) {
  // fill out default options
  const { observeSelector, observeOptions, delay, lookupCollections, clientCollection } = defaultOptions({
    collection,
    options,
  });

  // flag to prevent multiple ready messages from being sent
  let ready = false;
  // let myCounter = 0;
  // let myCounter2 = 0;
  // run, or re-run, the aggregation pipeline
  const throttledUpdate = _.throttle(
    Meteor.bindEnvironment(() => {
      // Promise.await(collection.rawCollection().aggregate(pipeline, localOptions.aggregationOptions).toArray());
      let cursor = Promise.await(collection.aggregate(safePipeline).toArray());
      // let myCounter = 0;
      // console.log({ myCounter: cursor.length });

      // myCounter.hasNext((item) => {
      //   console.log(item);
      // });

      cursor.forEach((doc, id, arr) => {
        // myCounter++;
        // console.log({ myCounter: myCounter.hasNext(() => false) });
        // console.log({ id, err, doc });
        // if (err) {
        //   // console.log({ id, err, doc });
        //   subscription.error(new Meteor.Error("aggregation-failed", err.message));
        // }
        // when cursor.each is done, it sends null in place of a document - check for that
        if (!doc) {
          // console.log("HERE NO DOC");
          // remove documents not in the result anymore
          _.each(subscription._ids, (iteration, key) => {
            if (iteration != subscription._iteration) {
              delete subscription._ids[key];
              subscription.removed(clientCollection, key);
            }
          });
          subscription._iteration++;
          // if this is the first run, mark the subscription ready
          if (!ready) {
            ready = true;
            subscription.ready();
          }
        }
        // cursor is not done iterating, add and update documents on the client
        else {
          // myCounter2++;
          if (!subscription._ids[doc._id]) {
            subscription.added(clientCollection, doc._id, doc);
          } else {
            subscription.changed(clientCollection, doc._id, doc);
          }
          subscription._ids[doc._id] = subscription._iteration;
        }
        if (id + 1 == cursor.length) subscription.ready();
        // console.log({ myCounter, myCounter2 });
      });
      // console.log({ "subscription._ids": subscription });
      _.each(subscription._ids, (iteration, key) => {
        if (iteration != subscription._iteration) {
          delete subscription._ids[key];
          subscription.removed(clientCollection, key);
        }
      });

      subscription._iteration++;
    }),
    delay
  );
  const update = () => (!initializing ? throttledUpdate() : null);

  // don't update the subscription until __after__ the initial hydrating of our collection
  let initializing = true;
  // mutate the subscription to ensure it updates as we version it
  subscription._ids = {};
  subscription._iteration = 1;

  // create a list of collections to watch and make sure
  // we create a sanitized "strings-only" version of our pipeline
  const observerHandles = [createObserver(collection, { observeSelector, observeOptions })];
  // look for $lookup collections passed in as Mongo.Collection instances
  // and create observers for them
  // if any $lookup.from stages are passed in as strings they will be omitted
  // from this process. the aggregation will still work, but those collections
  // will not force an update to this query if changed.
  const safePipeline = pipeline.map((stage) => {
    if (stage.$lookup && stage.$lookup.from instanceof Mongo.Collection) {
      const collection = stage.$lookup.from;
      observerHandles.push(createObserver(collection, lookupCollections[collection._name]));
      return {
        ...stage,
        $lookup: {
          ...stage.$lookup,
          from: collection._name,
        },
      };
    }
    return stage;
  });

  // observeChanges() will immediately fire an "added" event for each document in the query
  // these are skipped using the initializing flag
  initializing = false;
  // send an initial result set to the client
  update();
  // subscription.ready();
  // stop observing the cursor when the client unsubscribes
  subscription.onStop(() => observerHandles.map((handle) => handle.stop()));

  /**
   * Create observer
   * @param {Mongo.Collection|*} collection
   * @returns {any|*|Meteor.LiveQueryHandle} Handle
   */
  function createObserver(collection, queryOptions = {}) {
    const { observeSelector, observeOptions } = queryOptions;
    const selector = observeSelector || {};
    const options = observeOptions || {};
    const query = collection.find(selector, options);
    return query.observeChanges({
      added: update,
      changed: update,
      removed: update,
      error: (err) => {
        throw err;
      },
    });
  }
};
