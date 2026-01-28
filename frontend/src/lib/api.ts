import { getStoredToken, type AuthUser } from './authStorage'
import type {
  Assessment,
  CalculationOutputs,
  DayOverride,
  DayOverrideInputs,
  Plan,
  PlanMacroOverride,
  Food,
  Ingredient,
  WizardInputs,
  MealTemplate,
  MealItem,
} from '../types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api'

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
  macroOverrides?: PlanMacroOverride[]
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
type IngredientDto = FoodDto & {
  status?: 'active' | 'inactive'
  version?: number
  versionedFrom?: string | null
  replacedBy?: string | null
}

type MealTemplateDto = {
  _id: string
  createdAt: string
  name: string
  items: MealItem[]
  totals: { protein: number; carbs: number; fat: number; kcal: number }
}

type InviteDto = {
  _id: string
  createdAt: string
  codeSuffix: string
  role: 'admin' | 'member'
  maxUses: number
  usesCount: number
  expiresAt?: string
  status: 'active' | 'disabled' | 'expired' | 'consumed'
}

type AdminUserDto = {
  user: {
    id: string
    name?: string
    email?: string
    role: 'admin' | 'member'
    status: 'active' | 'disabled'
    createdAt: string
  }
  assessment?: AssessmentDto
  plan?: PlanDto
  overrides?: OverrideDto[]
}

export type Invite = {
  id: string
  createdAt: string
  codeSuffix: string
  role: 'admin' | 'member'
  maxUses: number
  usesCount: number
  expiresAt?: string
  status: 'active' | 'disabled' | 'expired' | 'consumed'
}

export type AdminOverviewItem = {
  user: AdminUserDto['user']
  assessment?: Assessment
  plan?: Plan
  overrides: DayOverride[]
}

export type IngredientUsage = {
  templates: number
  overrides: number
  total: number
}

export type IngredientStats = {
  total: number
  active: number
  inactive: number
}

export type IngredientPayload = {
  name: string
  group: Ingredient['group']
  subgrup?: string | null
  prot_100g: number
  cho_100g: number
  fat_100g: number
  kcal_100g: number
  default_portion_g?: number | null
  max_portion_in_meal?: number | null
}

export type IngredientUpdateResult = {
  ingredient: Ingredient
  versioned: boolean
  previousId?: string
  usage?: IngredientUsage
}

const request = async <T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> => {
  try {
    const token = getStoredToken()
    const { headers: customHeaders, ...rest } = options ?? {}
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((customHeaders as Record<string, string> | undefined) ?? {}),
    }

    const res = await fetch(`${API_URL}${path}`, {
      headers,
      ...rest,
    })
    if (res.status === 204) {
      return { data: {} as T }
    }

    const contentType = res.headers.get('content-type') ?? ''
    const isJson = contentType.includes('application/json')
    const body = isJson ? await res.json() : await res.text()

    if (!res.ok) {
      const message = isJson ? (body as any)?.error : (typeof body === 'string' ? body : '')
      return { data: {} as T, error: message || `Request failed (${res.status})` }
    }

    if (!isJson) {
      return { data: {} as T, error: `Expected JSON response, got ${contentType || 'unknown'} (${res.status})` }
    }

    return { data: body as T }
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
  macroOverrides: raw.macroOverrides,
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

const mapInvite = (raw: InviteDto): Invite => ({
  id: raw._id,
  createdAt: raw.createdAt,
  codeSuffix: raw.codeSuffix,
  role: raw.role,
  maxUses: raw.maxUses,
  usesCount: raw.usesCount,
  expiresAt: raw.expiresAt,
  status: raw.status,
})

const mapIngredient = (item: IngredientDto): Ingredient => ({
  id: item._id ?? item.id,
  name: item.name,
  group: item.group,
  subgrup:
    (item as any).subgrup ??
    (item as any).subgrupo ??
    (item as any).sub_group ??
    (item as any).subGroup ??
    (item as any).subgroupo ??
    null,
  prot_100g: item.prot_100g,
  cho_100g: item.cho_100g,
  fat_100g: item.fat_100g,
  kcal_100g: item.kcal_100g,
  default_portion_g: item.default_portion_g ?? null,
  max_portion_in_meal: item.max_portion_in_meal ?? null,
  status: item.status ?? 'active',
  version: item.version,
  versionedFrom: item.versionedFrom ?? null,
  replacedBy: item.replacedBy ?? null,
})

const mapMealTemplate = (raw: MealTemplateDto): MealTemplate => ({
  id: raw._id,
  createdAt: raw.createdAt,
  name: raw.name,
  items: raw.items,
  totals: raw.totals,
})

export const claimInvite = async (
  code: string,
  payload: { name?: string; email: string; password: string },
) => {
  const { data, error } = await request<{ token: string; user: AuthUser }>('/auth/claim-invite', {
    method: 'POST',
    body: JSON.stringify({ code, ...payload }),
  })
  if (error) throw new Error(error)
  return data
}

export const login = async (payload: { email: string; password: string }) => {
  const { data, error } = await request<{ token: string; user: AuthUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (error) throw new Error(error)
  return data
}

export const resetPassword = async (payload: { email: string; token: string; password: string }) => {
  const { data, error } = await request<{ ok: boolean }>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (error) throw new Error(error)
  return data
}

export const bootstrapAdmin = async (payload: {
  secret: string
  name?: string
  email?: string
  password?: string
}) => {
  const { data, error } = await request<{ token: string; user: AuthUser }>('/auth/bootstrap-admin', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (error) throw new Error(error)
  return data
}

export const createInvite = async (payload?: {
  role?: 'admin' | 'member'
  maxUses?: number
  expiresInDays?: number
}) => {
  const { data, error } = await request<{ invite: InviteDto; code: string }>('/admin/invites', {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  })
  if (error) throw new Error(error)
  return { invite: mapInvite(data.invite), code: data.code }
}

export const listInvites = async () => {
  const { data, error } = await request<{ invites: InviteDto[] }>('/admin/invites')
  if (error) throw new Error(error)
  return data.invites.map(mapInvite)
}

export const getAdminOverview = async () => {
  const { data, error } = await request<{ users: AdminUserDto[] }>('/admin/overview')
  if (error) throw new Error(error)
  return data.users.map((item) => ({
    user: item.user,
    assessment: item.assessment ? mapAssessment(item.assessment) : undefined,
    plan: item.plan ? mapPlan(item.plan) : undefined,
    overrides: (item.overrides ?? []).map(mapOverride),
  }))
}

export const createAdminPasswordReset = async (userId: string) => {
  const { data, error } = await request<{
    token: string
    resetUrl: string
    expiresAt: string
    email: string
  }>(`/admin/users/${userId}/reset-password`, {
    method: 'POST',
  })
  if (error) throw new Error(error)
  return data
}

export const listAdminIngredients = async (params?: {
  query?: string
  group?: Ingredient['group'] | 'all'
  subgrup?: string | 'all'
  status?: 'active' | 'inactive' | 'all'
  limit?: number
  offset?: number
}) => {
  const searchParams = new URLSearchParams()
  if (params?.query) searchParams.set('q', params.query)
  if (params?.group && params.group !== 'all') searchParams.set('group', params.group)
  if (params?.subgrup && params.subgrup !== 'all') searchParams.set('subgrup', params.subgrup)
  if (params?.status) searchParams.set('status', params.status)
  if (params?.limit !== undefined) searchParams.set('limit', String(params.limit))
  if (params?.offset !== undefined) searchParams.set('offset', String(params.offset))
  const qParam = searchParams.toString() ? `?${searchParams.toString()}` : ''

  const { data, error } = await request<{ ingredients: IngredientDto[] }>(`/admin/ingredients${qParam}`)
  if (error) throw new Error(error)
  return (data.ingredients ?? []).map(mapIngredient)
}

export const getIngredientStats = async () => {
  const { data, error } = await request<{ stats: IngredientStats }>('/admin/ingredients/stats')
  if (error) throw new Error(error)
  return data.stats
}

export const createIngredient = async (payload: IngredientPayload) => {
  const { data, error } = await request<{ ingredient: IngredientDto }>('/admin/ingredients', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (error) throw new Error(error)
  return mapIngredient(data.ingredient)
}

export const updateIngredient = async (ingredientId: string, payload: IngredientPayload): Promise<IngredientUpdateResult> => {
  const { data, error } = await request<{
    ingredient: IngredientDto
    versioned?: boolean
    previousId?: string
    usage?: IngredientUsage
  }>(`/admin/ingredients/${ingredientId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
  if (error) throw new Error(error)
  return {
    ingredient: mapIngredient(data.ingredient),
    versioned: data.versioned ?? false,
    previousId: data.previousId,
    usage: data.usage,
  }
}

export const updateIngredientStatus = async (ingredientId: string, status: 'active' | 'inactive') => {
  const { data, error } = await request<{ ingredient: IngredientDto }>(`/admin/ingredients/${ingredientId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  })
  if (error) throw new Error(error)
  return mapIngredient(data.ingredient)
}

export const getIngredientUsage = async (ingredientId: string) => {
  const { data, error } = await request<{ usage: IngredientUsage }>(`/admin/ingredients/${ingredientId}/usage`)
  if (error) throw new Error(error)
  return data.usage
}

export const createAssessment = async (inputs: WizardInputs) => {
  const { data, error } = await request<{ assessment: AssessmentDto; plan?: PlanDto }>('/assessments', {
    method: 'POST',
    body: JSON.stringify({ inputs }),
  })
  if (error) throw new Error(error)
  return {
    assessment: mapAssessment(data.assessment),
    plan: data.plan ? mapPlan(data.plan) : undefined,
  }
}

export const getLatestAssessment = async () => {
  const { data, error } = await request<{ assessment: AssessmentDto }>('/assessments/latest')
  if (error) throw new Error(error)
  return mapAssessment(data.assessment)
}

export const createPlan = async (payload: Omit<Plan, 'id' | 'createdAt' | 'status'>) => {
  const { data, error } = await request<{ plan: PlanDto }>('/plans', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (error) throw new Error(error)
  return mapPlan(data.plan)
}

export const listPlans = async () => {
  const { data, error } = await request<{ plans: PlanDto[] }>('/plans')
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

export const upsertPlanMacroOverride = async (payload: {
  planId: string
  macros: {
    protein: number
    carbsAdjusted: number
    fatsAdjusted: number
  }
  effectiveFrom?: string
}) => {
  const { planId, ...body } = payload
  const { data, error } = await request<{ plan: PlanDto }>(`/plans/${planId}/macro-overrides`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
  if (error) throw new Error(error)
  return mapPlan(data.plan)
}

export const updatePlanStatus = async (payload: { planId: string; status: 'active' | 'archived' }) => {
  const { planId, ...body } = payload
  const { data, error } = await request<{ plan: PlanDto }>(`/plans/${planId}/status`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
  if (error) throw new Error(error)
  return mapPlan(data.plan)
}

export const upsertOverride = async (payload: {
  planId: string
  date: string
  overrides: DayOverrideInputs
  note?: string
  meals?: any
}) => {
  const { planId, ...body } = payload
  const { data, error } = await request<{ override: OverrideDto }>(`/plans/${planId}/overrides`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
  if (error) throw new Error(error)
  return mapOverride(data.override)
}

export const deleteOverride = async (planId: string, date: string) => {
  const { error } = await request(`/plans/${planId}/overrides?date=${date}`, { method: 'DELETE' })
  if (error) throw new Error(error)
}

export const getDay = async (planId: string, date: string) => {
  const { data, error } = await request<{ outputs?: CalculationOutputs; override?: OverrideDto }>(
    `/plans/${planId}/day?date=${date}`,
  )
  if (error) throw new Error(error)
  return {
    outputs: data.override ? data.override.computed : data.outputs,
    override: data.override ? mapOverride(data.override) : undefined,
  }
}

export const deletePlan = async (planId: string) => {
  const { error } = await request(`/plans/${planId}`, { method: 'DELETE' })
  if (error) throw new Error(error)
}

export const listMealTemplates = async () => {
  const { data, error } = await request<{ templates: MealTemplateDto[] }>('/meal-library')
  if (error) throw new Error(error)
  return (data.templates ?? []).map(mapMealTemplate)
}

export const createMealTemplate = async (payload: {
  name: string
  items: MealItem[]
  totals: { protein: number; carbs: number; fat: number; kcal: number }
}) => {
  const { data, error } = await request<{ template: MealTemplateDto }>('/meal-library', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (error) throw new Error(error)
  return mapMealTemplate(data.template)
}

export const searchFoodsApi = async (
  query: string,
  options?: {
    group?: string
    limit?: number
    offset?: number
    signal?: AbortSignal
  },
) => {
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  if (options?.group) params.set('group', options.group)
  if (options?.limit !== undefined) params.set('limit', String(options.limit))
  if (options?.offset !== undefined) params.set('offset', String(options.offset))
  const qParam = params.toString() ? `?${params.toString()}` : ''
  const { data, error } = await request<{ foods: FoodDto[] }>(`/foods${qParam}`, { signal: options?.signal })
  if (error) throw new Error(error)
  return data.foods.map((f) => ({
    id: f._id ?? f.id,
    name: f.name,
    group: f.group,
    subgrup: (f as any).subgrup ?? (f as any).subgrupo ?? (f as any).sub_group,
    prot_100g: f.prot_100g,
    cho_100g: f.cho_100g,
    fat_100g: f.fat_100g,
    kcal_100g: f.kcal_100g,
    default_portion_g: f.default_portion_g,
    max_portion_in_meal: (f as any).max_portion_in_meal,
  }))
}
