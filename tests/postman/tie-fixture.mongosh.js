// Run AFTER the main suite. Test database ONLY; refuses existing fixture/data collections.
if (!db.getName().startsWith('repair_shop_test')) throw new Error('Select a repair_shop_test database first');
if (db.users.countDocuments({}) || db.notes.countDocuments({})) throw new Error('Use an empty test database for the tie fixture');
const userId = ObjectId('650000000000000000000010');
db.users.insertOne({_id:userId, username:'canonical_tie_fixture_user', password:'unused-direct-fixture-hash', roles:['Employee'], active:true});
const timestamp = ISODate('2026-01-01T00:00:00.000Z');
db.notes.insertMany([
  {_id:ObjectId('650000000000000000000001'),user:userId,title:'canonical-tie-fixture lower ID',text:'tie fixture',completed:false,ticket:900001,createdAt:timestamp,updatedAt:timestamp},
  {_id:ObjectId('650000000000000000000002'),user:userId,title:'canonical-tie-fixture higher ID',text:'tie fixture',completed:false,ticket:900002,createdAt:timestamp,updatedAt:timestamp}
]);
print('Run ONLY folder 07 with runTieFixture=true; then remove the fixed fixtures using README commands.');
