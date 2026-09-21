// Rank 1 / B1: same first pass, selectively investigate uncertainty or evidence conflict.
const pipeline = require('./pipeline.cjs');
module.exports = async function adaptive(batch, session) {
  const initial = await pipeline(batch, session);
  const review = batch.filter(node => {
    const decision = initial.find(d => d.node_id === node.node_id);
    return decision.needs_review || (decision.is_violation &&
      (decision.techniques.length === 0 || decision.techniques.some(t => !node.signals.includes(t))));
  });
  if (!review.length) return initial;
  const revised = await session.decide('judge', review, { phase: 'review', tools: true });
  return initial.map(d => revised.find(r => r.node_id === d.node_id) || d);
};
