/** Pure calendar, input, graph and exact-money checks. Uses no database or credentials. */
import assert from 'node:assert/strict'
import { addCalendarMonths, parseDependencyImport, reviewDueDates, validateDependencies } from '../src/lib/review-rules'
import { dateField } from '../src/lib/entity-input'
import { buildDisputeExposurePayload, disputeCurrency, parseDisputeAmount } from '../src/lib/dispute-rules'

const day = (value: string) => new Date(`${value}T00:00:00.000Z`)
assert.equal(addCalendarMonths(day('2024-01-31'), 1).toISOString().slice(0, 10), '2024-02-29')
assert.equal(addCalendarMonths(day('2026-01-31'), 1).toISOString().slice(0, 10), '2026-02-28')
const publicRule = { kind: 'PUBLIC', start_date: day('2026-01-31'), interval_months: null, steady_interval_months: null }
const publicDates = reviewDueDates(publicRule, day('2027-01-01'))
assert.equal(publicDates[0].toISOString().slice(0, 10), '2026-02-14')
assert.ok(publicDates.every((date) => date <= day('2026-07-31')))
for (let i = 1; i < publicDates.length; i++) assert.equal(publicDates[i].getTime() - publicDates[i - 1].getTime(), 14 * 86_400_000)
assert.equal(reviewDueDates(publicRule, day('2026-02-01')).length, 1)
assert.deepEqual(reviewDueDates({ ...publicRule, kind: 'INTERNAL', interval_months: 4 }, day('2026-10-01')).map((date) => date.toISOString().slice(0, 10)), ['2026-05-31', '2026-09-30', '2027-01-31'])
assert.throws(() => reviewDueDates({ ...publicRule, kind: 'INTERNAL', interval_months: 3 }, day('2026-02-01')), /4, 5 or 6/)
const form = new FormData(); form.set('start', '2026-02-30')
assert.throws(() => dateField(form, 'start'), /valid calendar date/)
const ids = new Set(['a', 'b', 'c'])
const edge = { source_schedule_id: 'a', target_schedule_id: 'b' }
validateDependencies([edge, edge], ids)
assert.throws(() => validateDependencies([edge, { source_schedule_id: 'b', target_schedule_id: 'a' }], ids), /cycle/)
assert.throws(() => validateDependencies([{ source_schedule_id: 'a', target_schedule_id: 'missing' }], ids), /missing/)
assert.throws(() => validateDependencies([{ source_schedule_id: 'a', target_schedule_id: 'a' }], ids), /itself/)
assert.deepEqual(parseDependencyImport(JSON.stringify([edge])), [edge])
assert.throws(() => parseDependencyImport('[{"source_schedule_id":4}]'), /Each row/)
const exact = '9007199254740993.12345678'
assert.equal(parseDisputeAmount(exact)?.toFixed(), exact)
assert.equal(parseDisputeAmount('0')?.toFixed(), '0')
assert.equal(parseDisputeAmount(''), null)
assert.throws(() => parseDisputeAmount('-1'), /non-negative/)
assert.throws(() => parseDisputeAmount('1e6'), /decimal/)
assert.equal(disputeCurrency('aed'), 'AED')
assert.throws(() => disputeCurrency('BOGUS'), /supported/)
const payload = buildDisputeExposurePayload({ id: 'synthetic-case', case_name: 'Synthetic case', entity: 'FSP', dispute_kind: 'LITIGATION', claim_type: 'Synthetic claim', status: 'FILED', estimated_liability: parseDisputeAmount(exact), currency: 'USD', exposure_basis: 'Synthetic test only', exposure_as_of: day('2026-09-21'), exposure_revision: 1 }, 'created')
assert.equal(payload.estimatedLiability, exact)
assert.equal(payload.asOf, '2026-09-21')
assert.equal(payload.schemaVersion, 1)
console.log('Entity/review/dispute checks passed: calendar boundaries, 14-day cadence, missed occurrences, dependency cycles/missing references, invalid dates, null versus zero and exact exposure strings.')
