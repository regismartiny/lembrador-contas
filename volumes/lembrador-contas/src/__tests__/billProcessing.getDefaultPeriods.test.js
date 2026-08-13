import billProcessing from '../util/billProcessing.js'
import db from '../db.js'

describe('getDefaultPeriods', () => {
  beforeAll(() => {
    // set deterministic current date: 2026-08-13
    jest.useFakeTimers({ now: new Date(2026, 7, 13) })
  })

  afterAll(() => {
    jest.useRealTimers()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('returns previous and current months when no table bills', async () => {
    const periods = await billProcessing.getDefaultPeriods([])
    expect(periods).toEqual([
      { month: 6, year: 2026 }, // July 2026 (previous month)
      { month: 7, year: 2026 }, // August 2026 (current month)
    ])
  })

  test('includes months found in table data', async () => {
    // table data with period.month = 10 (October 2026 as 1-based), becomes month0 = 9 (future)
    const mockTable = { data: [{ period: { month: 10, year: 2026 } }] }
    jest.spyOn(db.Table, 'findById').mockReturnValueOnce({ lean: () => Promise.resolve(mockTable) })

    const billsSourceTable = [{ valueSourceId: 't1' }]
    const periods = await billProcessing.getDefaultPeriods(billsSourceTable)

    expect(periods).toEqual([
      { month: 6, year: 2026 }, // July 2026 (previous month)
      { month: 7, year: 2026 }, // August 2026 (current month)
      { month: 9, year: 2026 }, // October 2026 (future month from table)
    ])
  })

  test('skips missing table entries gracefully', async () => {
    jest.spyOn(db.Table, 'findById').mockReturnValueOnce({ lean: () => Promise.resolve(null) })
    const periods = await billProcessing.getDefaultPeriods([{ valueSourceId: 'doesnotexist' }])
    expect(periods).toEqual([
      { month: 6, year: 2026 },
      { month: 7, year: 2026 },
    ])
  })
})
