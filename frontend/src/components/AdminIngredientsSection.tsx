import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { useEffect, useState, type ReactNode } from 'react'
import {
  createIngredient,
  getIngredientStats,
  getIngredientUsage,
  listAdminIngredients,
  updateIngredient,
  updateIngredientStatus,
  type IngredientPayload,
  type IngredientStats,
  type IngredientUsage,
} from '../lib/api'
import type { Ingredient } from '../types'

const GROUP_OPTIONS: Array<{ value: Ingredient['group']; label: string }> = [
  { value: 'carbohidratos', label: 'Carbohidratos' },
  { value: 'proteinas', label: 'Proteinas' },
  { value: 'grasas', label: 'Grasas' },
  { value: 'vegetales', label: 'Vegetales' },
  { value: 'extras', label: 'Extras' },
]

const STATUS_OPTIONS = [
  { value: 'active', label: 'Activos' },
  { value: 'inactive', label: 'Inactivos' },
  { value: 'all', label: 'Todos' },
] as const

const STATUS_CHIP: Record<string, { label: string; color: 'success' | 'default' }> = {
  active: { label: 'Activo', color: 'success' },
  inactive: { label: 'Inactivo', color: 'default' },
}

type IngredientFormState = {
  name: string
  group: string
  subgrup: string
  kcal_100g: string
  cho_100g: string
  prot_100g: string
  fat_100g: string
  default_portion_g: string
  max_portion_in_meal: string
}

const buildFormState = (ingredient?: Ingredient | null): IngredientFormState => ({
  name: ingredient?.name ?? '',
  group: ingredient?.group ?? '',
  subgrup: ingredient?.subgrup ?? '',
  kcal_100g: ingredient?.kcal_100g !== undefined && ingredient?.kcal_100g !== null ? String(ingredient.kcal_100g) : '',
  cho_100g: ingredient?.cho_100g !== undefined && ingredient?.cho_100g !== null ? String(ingredient.cho_100g) : '',
  prot_100g: ingredient?.prot_100g !== undefined && ingredient?.prot_100g !== null ? String(ingredient.prot_100g) : '',
  fat_100g: ingredient?.fat_100g !== undefined && ingredient?.fat_100g !== null ? String(ingredient.fat_100g) : '',
  default_portion_g:
    ingredient?.default_portion_g !== undefined && ingredient?.default_portion_g !== null
      ? String(ingredient.default_portion_g)
      : '',
  max_portion_in_meal:
    ingredient?.max_portion_in_meal !== undefined && ingredient?.max_portion_in_meal !== null
      ? String(ingredient.max_portion_in_meal)
      : '',
})

const parseNumber = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

const formatNumber = (value?: number | null) =>
  value === null || value === undefined || !Number.isFinite(value) ? '--' : Math.round(value).toString()

const FieldTooltip = ({ title, children }: { title: string; children: ReactNode }) => (
  <Tooltip title={title} arrow placement="top-start">
    <Box sx={{ width: '100%' }}>{children}</Box>
  </Tooltip>
)

const AdminIngredientsSection = () => {
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState<Ingredient['group'] | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active')
  const [refreshKey, setRefreshKey] = useState(0)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null)
  const [form, setForm] = useState<IngredientFormState>(() => buildFormState())
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof IngredientFormState, string>>>({})
  const [saving, setSaving] = useState(false)
  const [stats, setStats] = useState<IngredientStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState<string | null>(null)
  const [usage, setUsage] = useState<IngredientUsage | null>(null)
  const [usageLoading, setUsageLoading] = useState(false)
  const [usageError, setUsageError] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await listAdminIngredients({
          query: debouncedSearch || undefined,
          group: groupFilter,
          status: statusFilter,
          limit: 200,
        })
        if (!active) return
        console.log('Ingredients loaded', data)
        setIngredients(data)
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'No se pudo cargar ingredientes')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [debouncedSearch, groupFilter, statusFilter, refreshKey])

  useEffect(() => {
    let active = true
    const loadStats = async () => {
      setStatsLoading(true)
      setStatsError(null)
      try {
        const data = await getIngredientStats()
        console.log('Stats loaded', data)
        if (!active) return
        setStats(data)
      } catch (err) {
        if (!active) return
        setStatsError(err instanceof Error ? err.message : 'No se pudo cargar resumen')
      } finally {
        if (active) setStatsLoading(false)
      }
    }
    loadStats()
    return () => {
      active = false
    }
  }, [refreshKey])

  useEffect(() => {
    if (!actionMessage) return
    const timer = setTimeout(() => setActionMessage(null), 4000)
    return () => clearTimeout(timer)
  }, [actionMessage])

  const resetForm = (ingredient?: Ingredient | null) => {
    setForm(buildFormState(ingredient))
    setFormErrors({})
  }

  const handleOpenCreate = () => {
    setEditingIngredient(null)
    resetForm(null)
    setUsage(null)
    setUsageError(null)
    setDialogOpen(true)
  }

  const handleOpenEdit = async (ingredient: Ingredient) => {
    setEditingIngredient(ingredient)
    resetForm(ingredient)
    setUsage(null)
    setUsageError(null)
    setDialogOpen(true)
    setUsageLoading(true)
    try {
      const result = await getIngredientUsage(ingredient.id)
      setUsage(result)
    } catch (err) {
      setUsageError(err instanceof Error ? err.message : 'No se pudo verificar uso')
    } finally {
      setUsageLoading(false)
    }
  }

  const handleCloseDialog = () => {
    if (saving) return
    setDialogOpen(false)
  }

  const validateForm = () => {
    const errors: Partial<Record<keyof IngredientFormState, string>> = {}
    if (!form.name.trim()) errors.name = 'Nombre requerido'
    if (!form.group) errors.group = 'Grupo requerido'
    const kcal = parseNumber(form.kcal_100g)
    const cho = parseNumber(form.cho_100g)
    const prot = parseNumber(form.prot_100g)
    const fat = parseNumber(form.fat_100g)
    if (kcal === null || kcal < 0) errors.kcal_100g = 'Valor invalido'
    if (cho === null || cho < 0) errors.cho_100g = 'Valor invalido'
    if (prot === null || prot < 0) errors.prot_100g = 'Valor invalido'
    if (fat === null || fat < 0) errors.fat_100g = 'Valor invalido'
    const defaultPortion = parseNumber(form.default_portion_g)
    if (form.default_portion_g.trim() && (defaultPortion === null || defaultPortion <= 0)) {
      errors.default_portion_g = 'Debe ser mayor a 0'
    }
    const maxPortion = parseNumber(form.max_portion_in_meal)
    if (form.max_portion_in_meal.trim() && (maxPortion === null || maxPortion < 0)) {
      errors.max_portion_in_meal = 'Debe ser 0 o mayor'
    }
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

const buildPayload = (): IngredientPayload => ({
  name: form.name.trim(),
  group: form.group as Ingredient['group'],
  subgrup: form.subgrup.trim() ? form.subgrup.trim() : null,
  kcal_100g: Number(form.kcal_100g),
  cho_100g: Number(form.cho_100g),
  prot_100g: Number(form.prot_100g),
  fat_100g: Number(form.fat_100g),
    default_portion_g: form.default_portion_g.trim() ? Number(form.default_portion_g) : null,
    max_portion_in_meal: form.max_portion_in_meal.trim() ? Number(form.max_portion_in_meal) : null,
  })

  const handleSave = async () => {
    if (!validateForm()) return
    setSaving(true)
    try {
      const payload = buildPayload()
      if (editingIngredient) {
        const result = await updateIngredient(editingIngredient.id, payload)
        setActionMessage(
          result.versioned
            ? 'Ingrediente versionado. La version anterior quedo inactiva.'
            : 'Ingrediente actualizado.',
        )
      } else {
        await createIngredient(payload)
        setActionMessage('Ingrediente creado.')
      }
      setDialogOpen(false)
      setRefreshKey((prev) => prev + 1)
    } catch (err) {
      setFormErrors((prev) => ({
        ...prev,
        name: err instanceof Error ? err.message : 'No se pudo guardar',
      }))
    } finally {
      setSaving(false)
    }
  }

  const handleToggleStatus = async (ingredient: Ingredient) => {
    const nextStatus = ingredient.status === 'inactive' ? 'active' : 'inactive'
    try {
      await updateIngredientStatus(ingredient.id, nextStatus)
      setActionMessage(nextStatus === 'active' ? 'Ingrediente activado.' : 'Ingrediente desactivado.')
      setRefreshKey((prev) => prev + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar estado')
    }
  }

  const showUsageWarning = usage && usage.total > 0

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        alignItems={{ xs: 'stretch', sm: 'center' }}
        justifyContent="space-between"
      >
        <Box>
          <Typography variant="h6" fontWeight={700}>
            Catalogo de ingredientes
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Crea, edita o desactiva ingredientes sin afectar datos historicos.
          </Typography>
        </Box>
        <Button variant="contained" onClick={handleOpenCreate}>
          Agregar ingrediente
        </Button>
      </Stack>

      {actionMessage && <Alert severity="success">{actionMessage}</Alert>}
      {error && <Alert severity="warning">{error}</Alert>}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        {statsLoading
          ? Array.from({ length: 3 }).map((_, idx) => (
              <Paper key={`stats-${idx}`} variant="outlined" sx={{ flex: 1, p: 2 }}>
                <Skeleton variant="text" width="40%" />
                <Skeleton variant="text" width="30%" />
              </Paper>
            ))
          : [
              { label: 'Registrados', value: stats?.total ?? 0 },
              { label: 'Activos', value: stats?.active ?? 0 },
              { label: 'Inactivos', value: stats?.inactive ?? 0 },
            ].map((item) => (
              <Paper key={item.label} variant="outlined" sx={{ flex: 1, p: 2 }}>
                <Typography variant="overline" color="text.secondary">
                  {item.label}
                </Typography>
                <Typography variant="h6" fontWeight={800}>
                  {item.value}
                </Typography>
              </Paper>
            ))}
      </Stack>

      {statsError && <Alert severity="warning">{statsError}</Alert>}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
          <TextField
            label="Buscar por nombre"
            size="small"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            fullWidth
          />
          <FormControl size="small" sx={{ minWidth: 180 }} fullWidth>
            <InputLabel>Grupo</InputLabel>
            <Select
              value={groupFilter}
              label="Grupo"
              onChange={(event) => setGroupFilter(event.target.value as Ingredient['group'] | 'all')}
            >
              <MenuItem value="all">Todos</MenuItem>
              {GROUP_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }} fullWidth>
            <InputLabel>Estado</InputLabel>
            <Select
              value={statusFilter}
              label="Estado"
              onChange={(event) => setStatusFilter(event.target.value as 'active' | 'inactive' | 'all')}
            >
              {STATUS_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </Paper>

      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Nombre</TableCell>
              <TableCell>Grupo</TableCell>
              <TableCell>Subgrupo</TableCell>
              <TableCell align="right">Kcal 100g</TableCell>
              <TableCell align="right">CHO 100g</TableCell>
              <TableCell align="right">Prot 100g</TableCell>
              <TableCell align="right">Grasas 100g</TableCell>
              <TableCell align="right">Porcion</TableCell>
              <TableCell align="center">Estado</TableCell>
              <TableCell align="right">Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading &&
              Array.from({ length: 4 }).map((_, idx) => (
                <TableRow key={`skeleton-${idx}`}>
                  <TableCell colSpan={10}>
                    <Skeleton variant="rectangular" height={28} />
                  </TableCell>
                </TableRow>
              ))}
            {!loading && ingredients.length === 0 && (
              <TableRow>
                <TableCell colSpan={10}>
                  <Alert severity="info">No hay ingredientes para esos filtros.</Alert>
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              ingredients.map((ingredient) => {
                const statusKey = ingredient.status ?? 'active'
                const chip = STATUS_CHIP[statusKey] ?? STATUS_CHIP.active
                return (
                  <TableRow key={ingredient.id} hover>
                    <TableCell>
                      <Typography fontWeight={600}>{ingredient.name}</Typography>
                    </TableCell>
                    <TableCell>{GROUP_OPTIONS.find((opt) => opt.value === ingredient.group)?.label ?? ingredient.group}</TableCell>
                    <TableCell>{ingredient.subgrup || '--'}</TableCell>
                    <TableCell align="right">{formatNumber(ingredient.kcal_100g)}</TableCell>
                    <TableCell align="right">{formatNumber(ingredient.cho_100g)}</TableCell>
                    <TableCell align="right">{formatNumber(ingredient.prot_100g)}</TableCell>
                    <TableCell align="right">{formatNumber(ingredient.fat_100g)}</TableCell>
                    <TableCell align="right">
                      {ingredient.default_portion_g ? `${formatNumber(ingredient.default_portion_g)} g` : '--'}
                    </TableCell>
                    <TableCell align="center">
                      <Chip size="small" label={chip.label} color={chip.color} />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button size="small" variant="outlined" onClick={() => handleOpenEdit(ingredient)}>
                          Editar
                        </Button>
                        <Button
                          size="small"
                          variant="text"
                          color={statusKey === 'inactive' ? 'primary' : 'warning'}
                          onClick={() => handleToggleStatus(ingredient)}
                        >
                          {statusKey === 'inactive' ? 'Activar' : 'Desactivar'}
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                )
              })}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={dialogOpen} onClose={handleCloseDialog} fullWidth maxWidth="sm">
        <DialogTitle>{editingIngredient ? 'Editar ingrediente' : 'Agregar ingrediente'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {showUsageWarning && (
              <Alert severity="warning">
                Este ingrediente ya se usa en {usage?.total} platos. Los cambios se aplicaran hacia adelante.
              </Alert>
            )}
            {usageLoading && <Typography variant="caption">Verificando uso...</Typography>}
            {usageError && <Alert severity="warning">{usageError}</Alert>}

            <FieldTooltip title="Nombre visible en el catalogo. Debe ser unico.">
              <TextField
                label="Nombre"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                error={!!formErrors.name}
                helperText={formErrors.name ?? ' '}
                fullWidth
              />
            </FieldTooltip>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FieldTooltip title="Grupo principal para filtros y calculos.">
                <FormControl fullWidth error={!!formErrors.group}>
                  <InputLabel>Grupo</InputLabel>
                  <Select
                    value={form.group}
                    label="Grupo"
                    onChange={(event) => setForm((prev) => ({ ...prev, group: event.target.value }))}
                  >
                    {GROUP_OPTIONS.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                  {formErrors.group && <FormHelperText>{formErrors.group}</FormHelperText>}
                </FormControl>
              </FieldTooltip>
              <FieldTooltip title="Subgrupo opcional (ej: integrales, lacteos).">
                <TextField
                  label="Subgrupo"
                  value={form.subgrup}
                  onChange={(event) => setForm((prev) => ({ ...prev, subgrup: event.target.value }))}
                  fullWidth
                />
              </FieldTooltip>
            </Stack>

            <Divider />

            <Typography variant="subtitle2" fontWeight={700}>
              Valores nutricionales por 100g
            </Typography>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'repeat(1, minmax(0, 1fr))', sm: 'repeat(2, minmax(0, 1fr))' },
                gap: 2,
              }}
            >
              <FieldTooltip title="Energia total por 100g.">
                <TextField
                  label="Kcal 100g"
                  type="number"
                  value={form.kcal_100g}
                  onChange={(event) => setForm((prev) => ({ ...prev, kcal_100g: event.target.value }))}
                  error={!!formErrors.kcal_100g}
                  helperText={formErrors.kcal_100g ?? ' '}
                  inputProps={{ min: 0, step: 1 }}
                  fullWidth
                />
              </FieldTooltip>
              <FieldTooltip title="Carbohidratos por 100g.">
                <TextField
                  label="CHO 100g"
                  type="number"
                  value={form.cho_100g}
                  onChange={(event) => setForm((prev) => ({ ...prev, cho_100g: event.target.value }))}
                  error={!!formErrors.cho_100g}
                  helperText={formErrors.cho_100g ?? ' '}
                  inputProps={{ min: 0, step: 0.1 }}
                  fullWidth
                />
              </FieldTooltip>
              <FieldTooltip title="Proteinas por 100g.">
                <TextField
                  label="Prot 100g"
                  type="number"
                  value={form.prot_100g}
                  onChange={(event) => setForm((prev) => ({ ...prev, prot_100g: event.target.value }))}
                  error={!!formErrors.prot_100g}
                  helperText={formErrors.prot_100g ?? ' '}
                  inputProps={{ min: 0, step: 0.1 }}
                  fullWidth
                />
              </FieldTooltip>
              <FieldTooltip title="Grasas por 100g.">
                <TextField
                  label="Grasas 100g"
                  type="number"
                  value={form.fat_100g}
                  onChange={(event) => setForm((prev) => ({ ...prev, fat_100g: event.target.value }))}
                  error={!!formErrors.fat_100g}
                  helperText={formErrors.fat_100g ?? ' '}
                  inputProps={{ min: 0, step: 0.1 }}
                  fullWidth
                />
              </FieldTooltip>
            </Box>

            <Divider />

            <Typography variant="subtitle2" fontWeight={700}>
              Porciones
            </Typography>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FieldTooltip title="Gramos usados para calcular porciones en grupos especiales.">
                <TextField
                  label="Porcion default (g)"
                  type="number"
                  value={form.default_portion_g}
                  onChange={(event) => setForm((prev) => ({ ...prev, default_portion_g: event.target.value }))}
                  error={!!formErrors.default_portion_g}
                  helperText={formErrors.default_portion_g ?? ' '}
                  inputProps={{ min: 0, step: 1 }}
                  fullWidth
                />
              </FieldTooltip>
              <FieldTooltip title="Limite maximo de porciones por comida.">
                <TextField
                  label="Max porciones por comida"
                  type="number"
                  value={form.max_portion_in_meal}
                  onChange={(event) => setForm((prev) => ({ ...prev, max_portion_in_meal: event.target.value }))}
                  error={!!formErrors.max_portion_in_meal}
                  helperText={formErrors.max_portion_in_meal ?? ' '}
                  inputProps={{ step: 1 }}
                  fullWidth
                />
              </FieldTooltip>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}

export default AdminIngredientsSection
