import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";

test("upgrade holds self-reported unpaid work without deleting history or reserved amounts", async () => {
  const pg = new PGlite();
  await pg.waitReady;
  try {
    const names = (await readdir(new URL("../migrations/", import.meta.url)))
      .filter((n) => n.endsWith(".sql"))
      .sort();
    for (const name of names.filter((n) => n < "0008"))
      await pg.exec(
        await readFile(
          new URL(`../migrations/${name}`, import.meta.url),
          "utf8",
        ),
      );
    await pg.exec(`insert into profiles(user_id) values ('creator');
      insert into submissions(campaign_id,user_id,post_url,status,estimated_payout,payout_proof_url) values
      (1,'creator','https://same.example','approved',42.50,'https://old-proof.example/recording'),
      (1,'creator','https://same.example','paid',25.00,'https://old-proof.example/paid');
      insert into submission_reviews(submission_id,reviewer_id,action,reason) values (1,'admin','approve','Previous review');
      insert into payouts(user_id,submission_id,amount,reference) values ('creator',2,25.00,'historic-reference');
      insert into payout_batches(batch_date,created_by,total_units,item_count) values (current_date,'admin',42500000,1);
      insert into payout_items(batch_id,submission_id,user_id,wallet_address,amount_units,token_mint,idempotency_key) values (1,1,'creator','legacy-wallet',42500000,'legacy-mint','legacy-key');`);
    for (const name of names.filter((n) => n >= "0008"))
      await pg.exec(
        await readFile(
          new URL(`../migrations/${name}`, import.meta.url),
          "utf8",
        ),
      );
    const rows = (await pg.query<any>("select * from submissions order by id"))
      .rows;
    assert.equal(rows[0].status, "verification_failed");
    assert.equal(rows[0].verification_status, "unavailable");
    assert.equal(Number(rows[0].estimated_payout), 42.5);
    assert.equal(
      rows[0].payout_proof_url,
      "https://old-proof.example/recording",
    );
    assert.equal(rows[1].status, "paid");
    assert.equal(Number(rows[1].estimated_payout), 25);
    assert.equal(
      (await pg.query<any>("select reference from payouts")).rows[0].reference,
      "historic-reference",
    );
    assert.equal(
      (await pg.query<any>("select reason from submission_reviews")).rows[0]
        .reason,
      "Previous review",
    );
    assert.equal(
      (await pg.query<any>("select idempotency_key from payout_items")).rows[0]
        .idempotency_key,
      "legacy-key",
    );
    assert.equal(
      (await pg.query<any>("select status from payout_batches")).rows[0].status,
      "draft",
    );
  } finally {
    await pg.close();
  }
});
