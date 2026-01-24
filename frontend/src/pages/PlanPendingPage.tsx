import { Box, Button, Card, CardContent, Container, Stack, Typography } from '@mui/material'
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded'

type PlanPendingPageProps = {
  onRefresh?: () => void
  loading?: boolean
}

const PlanPendingPage = ({ onRefresh, loading = false }: PlanPendingPageProps) => (
  <Container maxWidth="sm" sx={{ py: { xs: 4, md: 6 } }}>
    <Card elevation={0}>
      <CardContent>
        <Stack spacing={3} alignItems="center" textAlign="center">
          <Box
            sx={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              bgcolor: 'primary.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'common.white',
              boxShadow: '0 16px 32px rgba(37, 99, 235, 0.25)',
            }}
          >
            <AccessTimeRoundedIcon fontSize="large" />
          </Box>
          <Stack spacing={1}>
            <Typography variant="h4" fontWeight={800}>
              Tu plan está en revisión
            </Typography>
            <Typography color="text.secondary">
              Tu plan está siendo revisado por la nutricionista. En breve tendrás tus macros listas para empezar a
              crear tus platos.
            </Typography>
          </Stack>
          {onRefresh && (
            <Button variant="contained" onClick={onRefresh} disabled={loading}>
              {loading ? 'Actualizando...' : 'Actualizar estado'}
            </Button>
          )}
          <Typography variant="caption" color="text.secondary">
            Si necesitas ayuda, escribe por WhatsApp desde el boton flotante.
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  </Container>
)

export default PlanPendingPage
