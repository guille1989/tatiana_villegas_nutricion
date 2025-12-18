import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deletePlan, listPlans } from '../lib/api'
import type { Plan } from '../types'

const PlansPage = () => {
  const navigate = useNavigate()
  const [plans, setPlans] = useState<Plan[]>([])
  const [snackbar, setSnackbar] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null)

  useEffect(() => {
    listPlans()
      .then((res) => setPlans(res))
      .catch(() => setPlans([]))
  }, [])

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deletePlan(deleteTarget.id)
      setPlans((prev) => prev.filter((plan) => plan.id !== deleteTarget.id))
      setSnackbar('Plan eliminado')
    } catch (err) {
      setSnackbar(err instanceof Error ? err.message : 'No se pudo eliminar')
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" fontWeight={800} gutterBottom>
            Planes
          </Typography>
          <Typography color="text.secondary">
            Tus planes se generan automaticamente al finalizar el wizard (plan base de 7 dias).
          </Typography>
        </Box>

        <Box flex={1} minWidth={0}>
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={700}>
              Tus planes
            </Typography>
            {plans.length === 0 && (
              <Alert severity="info">
                Aun no tienes planes creados. Finaliza el wizard para generar automaticamente un plan de 7 dias.
              </Alert>
            )}
            {plans.map((plan) => (
              <Card key={plan.id} elevation={0}>
                <CardContent>
                  <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
                    <Box>
                      <Typography variant="subtitle1" fontWeight={700}>
                        {plan.title ?? `Plan ${plan.days} dias`}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Inicio: {dayjs(plan.startDate).format('DD MMM YYYY')} · Duracion: {plan.days} dias
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                      <Button variant="outlined" onClick={() => navigate(`/plans/${plan.id}`)}>
                        Abrir
                      </Button>
                      <Button color="error" onClick={() => setDeleteTarget(plan)}>
                        Eliminar
                      </Button>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        </Box>
      </Stack>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Eliminar plan</DialogTitle>
        <DialogContent>Eliminar {deleteTarget?.title ?? 'este plan'}? Tambien se borraran sus overrides.</DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancelar</Button>
          <Button color="error" onClick={handleDelete}>
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!snackbar}
        autoHideDuration={2500}
        message={snackbar}
        onClose={() => setSnackbar(null)}
      />
    </Container>
  )
}

export default PlansPage
