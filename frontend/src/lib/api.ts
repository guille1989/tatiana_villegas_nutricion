import type {
  Assessment,
  CalculationOutputs,
  DayOverride,
  DayOverrideInputs,
  Plan,
  Food,
  WizardInputs,
} from '../types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api'
const DEFAULT_USER_ID = 'demo-user'

type ApiResponse<T> = { data: T; error?: string }

type AssessmentDto = {
  _id: string
  createdAt: string
  inputs: WizardInputs
  outputs: CalculationOutputs
  formulas?: Assessment['formulas']
}

type PlanDto = {
  _id: string
  createdAt: string
  baseAssessmentId: string | AssessmentDto
  startDate: string
  days: 5 | 7 | 15 | 30
  title?: string
  status?: Plan['status']
}

type OverrideDto = {
  _id: string
  planId: string | { _id: string }
  date: string
  overrides: DayOverrideInputs
  computed: CalculationOutputs
  meals?: any
  note?: string
  updatedAt: string
}

type FoodDto = Food & { _id: string }

const request = async <T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> => {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
    const json = await res.json()
    if (!res.ok) {
      return { data: json as T, error: json?.error ?? 'Request failed' }
    }
    return { data: json as T }
  } catch (err) {
    return { data: {} as T, error: err instanceof Error ? err.message : 'Network error' }
  }
}

const mapAssessment = (raw: AssessmentDto): Assessment => ({
  id: raw._id,
  createdAt: raw.createdAt,
  inputs: raw.inputs,
  outputs: raw.outputs,
  formulas: raw.formulas,
})

const mapPlan = (raw: PlanDto): Plan => ({
  id: raw._id,
  createdAt: raw.createdAt,
  baseAssessmentId: typeof raw.baseAssessmentId === 'string' ? raw.baseAssessmentId : raw.baseAssessmentId._id,
  startDate: raw.startDate,
  days: raw.days,
  title: raw.title,
  status: raw.status,
})

const mapOverride = (raw: OverrideDto): DayOverride => ({
  id: raw._id,
  planId: typeof raw.planId === 'string' ? raw.planId : raw.planId._id,
  date: raw.date,
  overrides: {
    ...raw.overrides,
    trainings:
      raw.overrides.trainings ??
      // Backward compatibility: map single training
      ((raw.overrides as any).training ? [(raw.overrides as any).training] : undefined),
  },
  meals: raw.meals as any,
  computed: raw.computed,
  note: raw.note,
  updatedAt: raw.updatedAt,
})

export const createAssessment = async (inputs: WizardInputs, userId = DEFAULT_USER_ID) => {
  const { data, error } = await request<{ assessment: AssessmentDto; plan?: PlanDto }>('/assessments', {
    method: 'POST',
    body: JSON.stringify({ userId, inputs }),
  })
  if (error) throw new Error(error)
  return {
    assessment: mapAssessment(data.assessment),
    plan: data.plan ? mapPlan(data.plan) : undefined,
  }
}

export const getLatestAssessment = async (userId = DEFAULT_USER_ID) => {
  const { data, error } = await request<{ assessment: AssessmentDto }>(`/assessments/latest?userId=${userId}`)
  if (error) throw new Error(error)
  return mapAssessment(data.assessment)
}

export const createPlan = async (
  payload: Omit<Plan, 'id' | 'createdAt' | 'status'> & { userId?: string },
  userId = DEFAULT_USER_ID,
) => {
  const body = { ...payload, userId }
  const { data, error } = await request<{ plan: PlanDto }>('/plans', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (error) throw new Error(error)
  return mapPlan(data.plan)
}

export const listPlans = async (userId = DEFAULT_USER_ID) => {
  const { data, error } = await request<{ plans: PlanDto[] }>(`/plans?userId=${userId}`)
  if (error) throw new Error(error)
  return data.plans.map(mapPlan)
}

export const getPlan = async (planId: string) => {
  const { data, error } = await request<{ plan: PlanDto; overrides?: OverrideDto[] }>(`/plans/${planId}`)
  if (error) throw new Error(error)
  return {
    plan: mapPlan(data.plan),
    overrides: (data.overrides ?? []).map(mapOverride),
    assessment:
      typeof data.plan.baseAssessmentId === 'string' ? undefined : mapAssessment(data.plan.baseAssessmentId as AssessmentDto),
  }
}

export const upsertOverride = async (payload: {
  planId: string
  date: string
  overrides: DayOverrideInputs
  note?: string
  meals?: any
  userId?: string
}) => {
  const { planId, ...body } = payload
  const { data, error } = await request<{ override: OverrideDto }>(`/plans/${planId}/overrides`, {
    method: 'PUT',
    body: JSON.stringify({ ...body, userId: body.userId ?? DEFAULT_USER_ID }),
  })
  if (error) throw new Error(error)
  return mapOverride(data.override)
}

export const deleteOverride = async (planId: string, date: string, userId = DEFAULT_USER_ID) => {
  const { error } = await request(`/plans/${planId}/overrides?date=${date}&userId=${userId}`, { method: 'DELETE' })
  if (error) throw new Error(error)
}

export const getDay = async (planId: string, date: string, userId = DEFAULT_USER_ID) => {
  const { data, error } = await request<{ outputs?: CalculationOutputs; override?: OverrideDto }>(
    `/plans/${planId}/day?date=${date}&userId=${userId}`,
  )
  if (error) throw new Error(error)
  return {
    outputs: data.override ? data.override.computed : data.outputs,
    override: data.override ? mapOverride(data.override) : undefined,
  }
}

export const deletePlan = async (planId: string, userId = DEFAULT_USER_ID) => {
  const { error } = await request(`/plans/${planId}?userId=${userId}`, { method: 'DELETE' })
  if (error) throw new Error(error)
}

export const searchFoodsApi = async (query: string, group?: string, signal?: AbortSignal) => {
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  if (group) params.set('group', group)
  const qParam = params.toString() ? `?${params.toString()}` : ''
  const { data, error } = await request<{ foods: FoodDto[] }>(`/foods${qParam}`, { signal })
  if (error) throw new Error(error)
  return data.foods.map((f) => ({
    id: f._id ?? f.id,
    name: f.name,
    group: f.group,
    sub_group: (f as any).sub_group,
    prot_100g: f.prot_100g,
    cho_100g: f.cho_100g,
    fat_100g: f.fat_100g,
    kcal_100g: f.kcal_100g,
  }))
}
