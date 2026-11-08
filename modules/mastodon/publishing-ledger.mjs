// Caller supplies a trusted Dispatch owner, never a request-body identity.
const valid = v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(v);
export class MastodonPublishingLedger {
 constructor(db, {siteId, ownerId}) {
  if (!db?.prepare || !valid(siteId) || !valid(ownerId)) throw Error('LEDGER_CONTEXT_INVALID');
  this.db=db; this.context=Object.freeze({siteId,ownerId});
 }
 validate({ownerId,reviewId}) {
  if(ownerId!==this.context.ownerId || !/^[a-f0-9]{64}$/.test(reviewId)) throw Error('LEDGER_OWNER_OR_REVIEW_INVALID');
 }
 async read(args) {
  this.validate(args);
  return await this.db.prepare('SELECT state,provider_id FROM mastodon_publications WHERE site_id=? AND owner_id=? AND review_id=?').bind(this.context.siteId,this.context.ownerId,args.reviewId).first() ?? null;
 }
 async reserve(args) {
  this.validate(args);
  if(args.state!=='outcome_unknown') throw Error('LEDGER_STATE_INVALID');
  const r=await this.db.prepare("INSERT INTO mastodon_publications (site_id,owner_id,review_id,state) VALUES (?,?,?,'outcome_unknown') ON CONFLICT(site_id,owner_id,review_id) DO NOTHING").bind(this.context.siteId,this.context.ownerId,args.reviewId).run();
  return r?.meta?.changes===1;
 }
 async finish(args) {
  this.validate(args);
  if(args.state!=='published'||!/^\d{1,40}$/.test(args.providerId)) throw Error('LEDGER_RESULT_INVALID');
  const r=await this.db.prepare("UPDATE mastodon_publications SET state='published',provider_id=? WHERE site_id=? AND owner_id=? AND review_id=? AND state='outcome_unknown'").bind(args.providerId,this.context.siteId,this.context.ownerId,args.reviewId).run();
  if(r?.meta?.changes!==1) throw Error('LEDGER_CONFLICT');
 }
}
