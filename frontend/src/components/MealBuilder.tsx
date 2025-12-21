import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import { useEffect, useRef, useState } from 'react'
import { calcFoodMacrosFromGrams, gramsFromPortions, searchFoods } from '../lib/foods'
import type { Food, Meal, MealItem } from '../types'
import MacroStatusBanner from './MacroStatusBanner'

type Props = {
  meals: Meal[]
  onChange: (meals: Meal[]) => void
  onSave?: (meals: Meal[]) => void
  budgetMacros: { protein: number; carbs: number; fat: number }
  onError: (msg: string) => void
}

const portionSizes = { protein: 10, carbs: 15, fat: 5 }
const MIN_SEARCH_LENGTH = 2
const SEARCH_DEBOUNCE_MS = 300

const macroToPortions = (macros: { protein: number; carbs: number; fat: number }) => ({
  protein: macros.protein / portionSizes.protein,
  carbs: macros.carbs / portionSizes.carbs,
  fat: macros.fat / portionSizes.fat,
})

const calcMealTotals = (items: MealItem[]) => {
  return items.reduce(
    (acc, item) => ({
      protein: acc.protein + item.macros.protein,
      carbs: acc.carbs + item.macros.carbs,
      fat: acc.fat + item.macros.fat,
      kcal: acc.kcal + item.kcal,
    }),
    { protein: 0, carbs: 0, fat: 0, kcal: 0 },
  )
}

const MealBuilder = ({ meals, onChange, onSave, budgetMacros, onError }: Props) => {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [autocompleteOpen, setAutocompleteOpen] = useState(false)
  const [selectedFood, setSelectedFood] = useState<Food | null>(null)
  const [mode, setMode] = useState<'grams' | 'portions'>('portions')
  const [amount, setAmount] = useState<number>(0)
  const amountInputRef = useRef<HTMLInputElement | null>(null)
  const [editingItem, setEditingItem] = useState<{
    mealKey: Meal['key']
    index: number
    item: MealItem
  } | null>(null)
  const [editAmount, setEditAmount] = useState<number>(0)
  const [editMode, setEditMode] = useState<'grams' | 'portions'>('grams')
  const [editError, setEditError] = useState<string | null>(null)

  const [foods, setFoods] = useState<Food[]>([])
  const [loadingFoods, setLoadingFoods] = useState(false)
  const [groupFilter, setGroupFilter] = useState<'all' | 'proteinas' | 'carbohidratos' | 'grasas'>('all')
  const [foodError, setFoodError] = useState<string | null>(null)

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedQuery(inputValue.trim())
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [inputValue])

  useEffect(() => {
    let active = true
    const trimmedQuery = debouncedQuery.trim()
    if (trimmedQuery.length < MIN_SEARCH_LENGTH) {
      setFoods([])
      setLoadingFoods(false)
      return () => {
        active = false
      }
    }
    const controller = new AbortController()
    setLoadingFoods(true)
    setFoodError(null)
    searchFoods(trimmedQuery, groupFilter, controller.signal)
      .then((list) => {
        if (active) setFoods(list)
      })
      .catch((err) => {
        if (!active) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        setFoods([])
        setFoodError('No se pudo cargar el listado de alimentos. Usando lista local.')
      })
      .finally(() => {
        if (active) setLoadingFoods(false)
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [debouncedQuery, groupFilter])

  const usedMacros = meals.reduce(
    (acc, meal) => {
      acc.protein += meal.totals.protein
      acc.carbs += meal.totals.carbs
      acc.fat += meal.totals.fat
      return acc
    },
    { protein: 0, carbs: 0, fat: 0 },
  )

  const remainingMacros = {
    protein: budgetMacros.protein - usedMacros.protein,
    carbs: budgetMacros.carbs - usedMacros.carbs,
    fat: budgetMacros.fat - usedMacros.fat,
  }

  const handleAdd = (mealKey: Meal['key']) => {
    if (!selectedFood) {
      onError('Selecciona un alimento')
      return
    }
    let grams = mode === 'grams' ? amount : 0
    if (mode === 'portions') {
      const g = gramsFromPortions(selectedFood, amount)
      if (g === null) {
        onError('No se puede calcular porciones para este alimento')
        return
      }
      grams = g
    }
    if (grams <= 0) {
      onError('Cantidad inválida')
      return
    }
    const macros = calcFoodMacrosFromGrams(selectedFood, grams)
    const newItem: MealItem = {
      foodId: selectedFood.id,
      nameSnapshot: selectedFood.name,
      grams,
      amount,
      mode,
      macros: { protein: macros.protein, carbs: macros.carbs, fat: macros.fat },
      kcal: macros.kcal,
    }

    const nextMeals = meals.map((meal) =>
      meal.key === mealKey ? { ...meal, items: [...meal.items, newItem] } : meal,
    )
    const updatedMeals = nextMeals.map((meal) =>
      meal.key === mealKey ? { ...meal, totals: calcMealTotals([...meal.items]) } : meal,
    )
    const dayTotals = updatedMeals.reduce(
      (acc, meal) => ({
        protein: acc.protein + meal.totals.protein,
        carbs: acc.carbs + meal.totals.carbs,
        fat: acc.fat + meal.totals.fat,
      }),
      { protein: 0, carbs: 0, fat: 0 },
    )

    if (dayTotals.protein > budgetMacros.protein || dayTotals.carbs > budgetMacros.carbs || dayTotals.fat > budgetMacros.fat) {
      onError('Te estás pasando del presupuesto. Ajusta la cantidad.')
      //return
    }

    onChange(updatedMeals)
    onSave?.(updatedMeals)
  }

  const handleRemoveItem = (mealKey: Meal['key'], idx: number) => {
    const nextMeals = meals.map((meal) =>
      meal.key === mealKey
        ? { ...meal, items: meal.items.filter((_, i) => i !== idx) }
        : meal,
    )
    const updatedMeals = nextMeals.map((meal) =>
      meal.key === mealKey ? { ...meal, totals: calcMealTotals(meal.items) } : meal,
    )
    onChange(updatedMeals)
    onSave?.(updatedMeals)
  }

  const portionString = (macros: { protein: number; carbs: number; fat: number }) => {
    const portions = macroToPortions(macros)
    return `P ${portions.protein.toFixed(1)} · C ${portions.carbs.toFixed(1)} · G ${portions.fat.toFixed(1)}`
  }

  const handleGroupChange = (value: typeof groupFilter) => {
    setGroupFilter(value)
    const trimmedQuery = inputValue.trim()
    if (trimmedQuery.length >= MIN_SEARCH_LENGTH) {
      setDebouncedQuery(trimmedQuery)
    }
  }

  const resolveItemMode = (item: MealItem): 'grams' | 'portions' => {
    if (item.mode === 'portions' && item.amount && item.amount > 0) return 'portions'
    return 'grams'
  }

  const handleOpenEdit = (mealKey: Meal['key'], index: number, item: MealItem) => {
    const nextMode = resolveItemMode(item)
    const nextAmount = nextMode === 'grams' ? item.grams : item.amount ?? 0
    setEditMode(nextMode)
    setEditAmount(Number.isFinite(nextAmount) ? nextAmount : 0)
    setEditError(null)
    setEditingItem({ mealKey, index, item })
  }

  const handleCloseEdit = () => {
    setEditingItem(null)
    setEditError(null)
  }

  const handleEditSave = () => {
    if (!editingItem) return
    const nextAmount = Number(editAmount)
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
      setEditError('Cantidad invalida')
      return
    }
    const currentItem = editingItem.item
    let newGrams = nextAmount
    if (editMode === 'portions') {
      const baseAmount = currentItem.amount ?? 0
      if (baseAmount <= 0) {
        setEditError('No se puede recalcular porciones para este alimento')
        return
      }
      const gramsPerPortion = currentItem.grams / baseAmount
      newGrams = gramsPerPortion * nextAmount
    }
    if (!Number.isFinite(newGrams) || newGrams <= 0 || currentItem.grams <= 0) {
      setEditError('Cantidad invalida')
      return
    }

    const ratio = newGrams / currentItem.grams
    const updatedItem: MealItem = {
      ...currentItem,
      grams: newGrams,
      amount: editMode === 'grams' ? newGrams : nextAmount,
      mode: editMode,
      macros: {
        protein: currentItem.macros.protein * ratio,
        carbs: currentItem.macros.carbs * ratio,
        fat: currentItem.macros.fat * ratio,
      },
      kcal: currentItem.kcal * ratio,
    }

    const nextMeals = meals.map((meal) => {
      if (meal.key !== editingItem.mealKey) return meal
      const items = meal.items.map((item, idx) => (idx === editingItem.index ? updatedItem : item))
      return { ...meal, items, totals: calcMealTotals(items) }
    })

    onChange(nextMeals)
    onSave?.(nextMeals)
    setEditingItem(null)
  }

  const editModeLabel = editMode === 'grams' ? 'Gramos' : 'Porciones'
  const editAmountInvalid = !Number.isFinite(editAmount) || editAmount <= 0

  return (
    <>
      <Stack spacing={1.5}>
      {meals.map((meal) => (
        <Accordion
          key={meal.key}
          expanded={expanded === meal.key}
          onChange={() => setExpanded(expanded === meal.key ? null : meal.key)}
          sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{ '& .MuiAccordionSummary-content': { m: 0, alignItems: 'center' }, px: 1.5, py: 1 }}
          >
            <Stack direction="row" spacing={1} alignItems="center" flex={1} justifyContent="space-between">
              <Stack spacing={0.25}>
                <Typography variant="body1" fontWeight={700}>
                  {meal.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {meal.totals.kcal.toFixed(0)} kcal · {portionString(meal.totals)}
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {meal.items.length} items
              </Typography>
            </Stack>
          </AccordionSummary>
          <AccordionDetails sx={{ px: 1.5, pb: 1.5, pt: 0.5 }}>
              <Stack spacing={1.5}>
              <MacroStatusBanner budget={macroToPortions(budgetMacros)} used={macroToPortions(usedMacros)} />
              <Autocomplete
                size="small"
                fullWidth
                value={selectedFood}
                inputValue={inputValue}
                options={foods}
                loading={loadingFoods}
                open={autocompleteOpen && inputValue.trim().length >= MIN_SEARCH_LENGTH}
                onOpen={() => {
                  if (inputValue.trim().length >= MIN_SEARCH_LENGTH) {
                    setAutocompleteOpen(true)
                  }
                }}
                onClose={() => setAutocompleteOpen(false)}
                openOnFocus
                autoHighlight
                filterOptions={(options) => options}
                getOptionLabel={(option) => option.name}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                noOptionsText={inputValue.trim().length < MIN_SEARCH_LENGTH ? 'Escribe al menos 2 caracteres' : 'Sin resultados'}
                loadingText="Cargando..."
                onInputChange={(_, newValue, reason) => {
                  if (reason === 'reset') return
                  setInputValue(newValue)
                  if (reason === 'input') {
                    const trimmed = newValue.trim()
                    if (trimmed.length < MIN_SEARCH_LENGTH) {
                      setDebouncedQuery('')
                      setFoods([])
                      setAutocompleteOpen(false)
                      setSelectedFood(null)
                      return
                    }
                    setSelectedFood(null)
                    setAutocompleteOpen(true)
                  }
                  if (reason === 'clear') {
                    setDebouncedQuery('')
                    setFoods([])
                    setAutocompleteOpen(false)
                    setSelectedFood(null)
                  }
                }}
                onChange={(_, newValue) => {
                  if (!newValue) return
                  setSelectedFood(newValue)
                  setInputValue(newValue.name)
                  setAutocompleteOpen(false)
                  amountInputRef.current?.focus()
                }}
                renderOption={(props, option) => (
                  <li {...props}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" width="100%" gap={1}>
                      <Typography variant="body2" fontWeight={600}>
                        {option.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {option.kcal_100g} kcal /100g
                      </Typography>
                    </Stack>
                  </li>
                )}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Buscar alimento"
                    InputProps={{
                      ...params.InputProps,
                      startAdornment: (
                        <>
                          <InputAdornment position="start">
                            <SearchIcon fontSize="small" />
                          </InputAdornment>
                          {params.InputProps.startAdornment}
                        </>
                      ),
                      endAdornment: (
                        <>
                          {loadingFoods ? <CircularProgress color="inherit" size={16} sx={{ mr: 1 }} /> : null}
                          {params.InputProps.endAdornment}
                        </>
                      ),
                    }}
                  />
                )}
              />
              <TextField
                select
                size="small"
                label="Filtrar por grupo"
                value={groupFilter}
                onChange={(e) => handleGroupChange(e.target.value as typeof groupFilter)}
              >
                <MenuItem value="all">Todos</MenuItem>
                <MenuItem value="proteinas">ProteA-nas</MenuItem>
                <MenuItem value="carbohidratos">Carbohidratos</MenuItem>
                <MenuItem value="grasas">Grasas</MenuItem>
              </TextField>
              {foodError && (
                <Typography variant="caption" color="error">
                  {foodError}
                </Typography>
              )}
              <Stack direction="row" spacing={1}>
                <TextField
                  select
                  size="small"
                  label="Modo"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as 'grams' | 'portions')}
                  sx={{ width: 140 }}
                >
                  <MenuItem value="grams">Gramos</MenuItem>
                  <MenuItem value="portions">Porciones</MenuItem>
                </TextField>
                <TextField
                  size="small"
                  type="number"
                  label={mode === 'grams' ? 'Gramos' : 'Porciones'}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  fullWidth
                  inputProps={{ min: 0, step: mode === 'grams' ? 10 : 0.25 }}
                  inputRef={amountInputRef}
                />
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleAdd(meal.key)}>
                  Agregar
                </Button>
              </Stack>

              <Stack spacing={1}>
                {meal.items.map((item, idx) => (
                  <Box
                    key={idx}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleOpenEdit(meal.key, idx, item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleOpenEdit(meal.key, idx, item)
                      }
                    }}
                    sx={{
                      p: 1,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1,
                      cursor: 'pointer',
                      transition: 'background-color 0.2s ease',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Stack spacing={0.25}>
                      <Typography variant="body2" fontWeight={700}>
                        {item.nameSnapshot}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {item.grams.toFixed(0)} g · {item.kcal.toFixed(0)} kcal · P {item.macros.protein.toFixed(1)} · C{' '}
                        {item.macros.carbs.toFixed(1)} · G {item.macros.fat.toFixed(1)}
                      </Typography>
                    </Stack>
                    <IconButton
                      edge="end"
                      size="small"
                      color="error"
                      aria-label="Eliminar"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemoveItem(meal.key, idx)
                      }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
                {meal.items.length === 0 && (
                  <Typography variant="caption" color="text.secondary">
                    No hay items en esta comida.
                  </Typography>
                )}
              </Stack>

              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="body2" fontWeight={700}>
                  Totales comida: {meal.totals.kcal.toFixed(0)} kcal · {portionString(meal.totals)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Saldo día: P {remainingMacros.protein.toFixed(1)} · C {remainingMacros.carbs.toFixed(1)} · G{' '}
                  {remainingMacros.fat.toFixed(1)}
                </Typography>
              </Stack>
            </Stack>
          </AccordionDetails>
        </Accordion>
      ))}
    </Stack>
      <Dialog open={!!editingItem} onClose={handleCloseEdit} fullWidth maxWidth="xs">
        <DialogTitle>Editar alimento</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <Typography variant="subtitle2">{editingItem?.item.nameSnapshot}</Typography>
            <TextField size="small" label="Modo" value={editModeLabel} disabled />
            <TextField
              size="small"
              type="number"
              label={editModeLabel}
              value={editAmount}
              onChange={(e) => {
                setEditAmount(Number(e.target.value))
                setEditError(null)
              }}
              error={editAmountInvalid || !!editError}
              helperText={editError ?? (editAmountInvalid ? 'Cantidad invalida' : ' ')}
              inputProps={{ min: 0, step: editMode === 'grams' ? 10 : 0.25 }}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseEdit}>Cancelar</Button>
          <Button variant="contained" onClick={handleEditSave} disabled={editAmountInvalid}>
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

export default MealBuilder
