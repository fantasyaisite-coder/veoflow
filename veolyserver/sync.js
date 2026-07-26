const { syncAll } = require("./lib/sync");

(async () => {
  console.log("Starting sync...");
  const result = await syncAll();
  console.log(JSON.stringify(result, null, 2));
})();
