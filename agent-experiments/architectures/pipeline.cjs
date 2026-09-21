// Shared first pass: fixed evidence, one judgment call per batch.
module.exports = async function pipeline(batch, session) {
  return session.decide('judge', batch, { phase: 'initial' });
};
