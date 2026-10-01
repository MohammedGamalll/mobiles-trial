import { openSqlite } from "../worker/lib/db.ts";
import { reconcile } from "../worker/lib/reconcile.ts";

const db = openSqlite("data/motamayez.sqlite");
const data = await reconcile(db);
console.log(JSON.stringify(data, null, 2));
