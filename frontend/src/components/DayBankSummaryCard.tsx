import { Box, Card, CardContent, Divider, Stack, Typography } from '@mui/material'
import { toMacroPortions } from '../lib/calc'

type Macros = { protein: number; carbs: number; fat: number }

type Props = {
  objectiveKcal: number
  objectiveMacros: Macros
  usedMacros: Macros
}

const formatInt = (value: number) => Math.round(value)

const DayBankSummaryCard = ({ objectiveKcal, objectiveMacros, usedMacros }: Props) => {
  const budgetPortions = toMacroPortions(objectiveMacros)
  const usedPortions = toMacroPortions(usedMacros)
  const remainingPortions = {
    protein: budgetPortions.protein - usedPortions.protein,
    carbs: budgetPortions.carbs - usedPortions.carbs,
    fat: budgetPortions.fat - usedPortions.fat,
  }

  const pill = (title: string, primary: string, secondary: string) => (
    <Box
      sx={{
        p: 1,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'grey.50',
      }}
    >
      <Typography variant="caption" color="text.secondary">
        {title}
      </Typography>
      <Typography variant="body1" fontWeight={700}>
        {primary}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {secondary}
      </Typography>
    </Box>
  )

  return (
    <Card variant="outlined" sx={{ borderRadius: 3, borderColor: 'divider' }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Stack spacing={2}>
          <Stack spacing={0.25}>
            <Typography variant="subtitle1" fontWeight={700}>
              Banco y presupuesto
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Kcal objetivo: {formatInt(objectiveKcal)} kcal
            </Typography>
          </Stack>

          <Stack spacing={2}>
            <Stack spacing={0.5}>
              <Typography variant="caption" color="text.secondary">
                Macros objetivo (g)
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: 'repeat(2, minmax(0,1fr))', sm: 'repeat(3, minmax(0,1fr))' },
                  gap: 1,
                }}
              >
                {pill('Prote', `${formatInt(objectiveMacros.protein)} g`, `Usado ${formatInt(usedMacros.protein)} g`)}
                {pill('Carbs', `${formatInt(objectiveMacros.carbs)} g`, `Usado ${formatInt(usedMacros.carbs)} g`)}
                {pill('Grasa', `${formatInt(objectiveMacros.fat)} g`, `Usado ${formatInt(usedMacros.fat)} g`)}
              </Box>
            </Stack>

            <Divider />

            <Stack spacing={0.5}>
              <Typography variant="caption" color="text.secondary">
                Presupuesto porciones
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: 'repeat(2, minmax(0,1fr))', sm: 'repeat(3, minmax(0,1fr))' },
                  gap: 1,
                }}
              >
                {pill(
                  'Prote',
                  `${formatInt(budgetPortions.protein)} porciones`,
                  `Restan ${formatInt(remainingPortions.protein)}`,
                )}
                {pill(
                  'Carbs',
                  `${formatInt(budgetPortions.carbs)} porciones`,
                  `Restan ${formatInt(remainingPortions.carbs)}`,
                )}
                {pill(
                  'Grasa',
                  `${formatInt(budgetPortions.fat)} porciones`,
                  `Restan ${formatInt(remainingPortions.fat)}`,
                )}
              </Box>
            </Stack>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}

export default DayBankSummaryCard
