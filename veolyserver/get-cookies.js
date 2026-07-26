const { db } = require("./lib/firebase");

(async () => {
  const snap = await db.collection("pool_cookies").where("is_active", "==", true).get();
  if (snap.empty) {
    console.log("No active cookies found");
    return;
  }

  const cookies = snap.docs.map((d) => {
    const c = d.data();
    return {
      name: c.cookie_name,
      value: c.cookie_value,
      domain: c.cookie_domain || "",
      path: c.cookie_path || "/",
      secure: c.secure,
      httpOnly: c.http_only,
      sameSite: c.same_site || "Lax",
      source: c.source || "?",
    };
  });

  console.log(`\nTotal: ${cookies.length} cookies\n`);

  // Format 1: JSON (copy-paste for devtools)
  console.log("── JSON ──");
  console.log(JSON.stringify(cookies, null, 2));

  // Format 2: Netscape cookie format (for cookie.txt importers)
  console.log("\n── Netscape Format ──");
  cookies.forEach((c) => {
    const secure = c.secure ? "TRUE" : "FALSE";
    const httpOnly = c.httpOnly ? "TRUE" : "FALSE";
    console.log(`${c.domain}\t${c.domain.startsWith(".") ? "TRUE" : "FALSE"}\t${c.path}\t${secure}\t${0}\t${c.name}\t${c.value}`);
  });
})();
