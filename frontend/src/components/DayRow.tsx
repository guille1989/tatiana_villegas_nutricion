import {
  Chip,
  Collapse,
  Divider,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material'
import dayjs from 'dayjs'
import type { CalculationOutputs } from '../types'
import DayCard from './DayCard'

type Props = {
  date: string
  outputs: CalculationOutputs
  dayType: 'training' | 'rest'
  hasOverride?: boolean
  note?: string
  isExpanded: boolean
  onToggle: () => void
  onEdit: () => void
}

const formatInt = (value: number) => Math.round(value)

const DayRow = ({
  date,
  outputs,
  dayType,
  hasOverride,
  note,
  isExpanded,
  onToggle,
  onEdit,
}: Props) => {
  const weekday = dayjs(date).format('ddd').toUpperCase()
  const friendlyDate = dayjs(date).format('DD MMM YYYY')
  const isTraining = dayType === 'training'

  return (
    <>
      <ListItem disablePadding sx={{ bgcolor: isExpanded ? 'action.hover' : 'transparent' }}>
        <ListItemButton onClick={onToggle} sx={{ py: 1.5 }}>
          <ListItemText
            primary={
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="subtitle2" fontWeight={800}>
                  {weekday}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {friendlyDate}
                </Typography>
                <Chip size="small" label={isTraining ? 'Entreno' : 'Descanso'} color={isTraining ? 'primary' : 'default'} />
                {hasOverride && <Chip size="small" label="Override" color="secondary" variant="outlined" />}
              </Stack>
            }
            secondary={
              <Typography variant="body2" fontWeight={700}>
                {formatInt(outputs.kcalObjectiveDay)} kcal
              </Typography>
            }
          />
        </ListItemButton>
      </ListItem>
      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
        <DayCard
          date={date}
          outputs={outputs}
          dayType={dayType}
          hasOverride={hasOverride}
          note={note}
          onEdit={onEdit}
        />
      </Collapse>
      <Divider component="li" />
    </>
  )
}

export default DayRow
