// Rank 3 / B2: independent evidence specialists, then one integrating judgment.
module.exports = async function specialists(batch, session) {
  const roles = ['characters', 'styles', 'context'];
  const settled = await Promise.allSettled(roles.map(role => session.decide(role, batch, { phase: 'expert', tools: true })));
  const failed = settled.find(result => result.status === 'rejected');
  if (failed) throw failed.reason;
  const experts = Object.fromEntries(roles.map((role, i) => [role, settled[i].value]));
  return session.decide('integrator', batch, { experts });
};
