const { User } = require('../models');

async function seedUsers() {
  // In production, NEVER auto-seed or reset accounts unless ALLOW_DEMO_MODE is explicitly enabled
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_MODE !== 'true') {
    return;
  }

  const users = [
    { name:'Aryan Sharma', email:'student@demo.com', password:'demo1234', role:'student', institution:'Demo College, Mumbai' },
    { name:'Prof. Meera Joshi', email:'teacher@demo.com', password:'demo1234', role:'teacher', institution:'Demo College, Mumbai' }
  ];
  for (const u of users) {
    try {
      const ex = await User.findOne({ email: u.email });
      if (!ex) { await User.create(u); console.log(`Seeded: ${u.email}`); }
      else { ex.password = u.password; await ex.save(); console.log(`Reset: ${u.email}`); }
    } catch(e) { console.error('Seed error:', e.message); }
  }
}
module.exports = { seedUsers };