Package.describe({
  name: "1stman:reactive-aggregate",
  version: "1.0.6",
  // Brief, one-line summary of the package.
  summary: "",
  // URL to the Git repository containing the source code for this package.
  git: "",
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: "README.md",
});

Package.onUse(function (api) {
  api.versionsFrom("1.5");
  api.use(["ecmascript", "underscore", "mongo", "promise"]);

  api.addFiles("./mongo-collection-aggregate.js");
  api.mainModule("./aggregate.js");
});
