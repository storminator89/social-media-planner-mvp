// Site/owner/configuration-bound authenticated encryption and compare-and-swap.
export class MastodonStore {
 constructor(db,cipher,context){if(!db?.prepare)throw new Error('STORE_REQUIRED');this.db=db;this.cipher=cipher;this.context=context;}
 async read(){const r=await this.db.prepare('SELECT version,envelope FROM mastodon_oauth_attempts WHERE site_id=? AND owner_id=?').bind(this.context.siteId,this.context.ownerId).first();return r?{version:r.version,value:await this.cipher.open(this.context,r.version,r.envelope)}:null;}
 async write(previous,value){const version=(previous?.version||0)+1,envelope=await this.cipher.seal(this.context,version,value);const r=previous?await this.db.prepare('UPDATE mastodon_oauth_attempts SET version=?,envelope=? WHERE site_id=? AND owner_id=? AND version=?').bind(version,envelope,this.context.siteId,this.context.ownerId,previous.version).run():await this.db.prepare('INSERT INTO mastodon_oauth_attempts (site_id,owner_id,version,envelope) VALUES (?,?,?,?) ON CONFLICT(site_id,owner_id) DO NOTHING').bind(this.context.siteId,this.context.ownerId,version,envelope).run();if(r?.meta?.changes!==1)throw new Error('STORE_CONFLICT');return{version,value};}
}
