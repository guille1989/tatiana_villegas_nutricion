import type { WizardFormData } from './schema'

const WIZARD_FORM_KEY = 'nutrition-wizard'

const hasWindow = typeof window !== 'undefined'

const safeGetItem = (key: string) => {
  if (!hasWindow) return null
  try {
    return window.localStorage.getItem(key)
  } catch (err) {
    console.warn('No se pudo leer localStorage', err)
    return null
  }
}

const safeSetItem = (key: string, value: string) => {
  if (!hasWindow) return
  try {
    window.localStorage.setItem(key, value)
  } catch (err) {
    console.warn('No se pudo guardar en localStorage', err)
  }
}

const safeRemoveItem = (key: string) => {
  if (!hasWindow) return
  try {
    window.localStorage.removeItem(key)
  } catch (err) {
    console.warn('No se pudo eliminar de localStorage', err)
  }
}

export const readJSON = <T>(key: string, fallback: T): T => {
  const raw = safeGetItem(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch (err) {
    console.warn('No se pudo parsear localStorage', err)
    return fallback
  }
}

export const writeJSON = <T>(key: string, value: T) => {
  safeSetItem(key, JSON.stringify(value))
}

export const removeKey = (key: string) => safeRemoveItem(key)

export const loadFormData = (): Partial<WizardFormData> | null => {
  const parsed = readJSON<Partial<WizardFormData> | null>(WIZARD_FORM_KEY, null)
  return parsed
}

export const saveFormData = (data: Partial<WizardFormData>) => {
  writeJSON(WIZARD_FORM_KEY, data)
}

export const clearFormData = () => {
  removeKey(WIZARD_FORM_KEY)
}
