export const RE_REQ = /^R-[A-Z]\d+$/;
export const RE_SUB = /^R-[A-Z]\d+\.\d+$/;
export const RE_REQ_OR_SUB = /^R-[A-Z]\d+(\.\d+)?$/;
export const RE_TASK = /^T\d+$/;

export function isReqId(s) { return typeof s === 'string' && RE_REQ.test(s); }
export function isSubId(s) { return typeof s === 'string' && RE_SUB.test(s); }
export function isReqOrSub(s) { return typeof s === 'string' && RE_REQ_OR_SUB.test(s); }
export function isTaskId(s) { return typeof s === 'string' && RE_TASK.test(s); }

export function parentOf(subId) {
  const m = /^(R-[A-Z]\d+)\.\d+$/.exec(subId);
  return m ? m[1] : null;
}

export function nextTaskId(existingIds) {
  let max = 0;
  for (const id of existingIds || []) {
    const m = /^T(\d+)$/.exec(id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `T${max + 1}`;
}
