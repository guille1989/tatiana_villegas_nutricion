import { Card, CardContent, Stack, Typography, Box } from "@mui/material";

type Macros = { protein: number; carbs: number; fat: number };

type Props = {
  macrosObjective: Macros;
  macrosUsed: Macros;
  portionsBudget: Macros;
  portionsUsed: Macros;
};

const formatRemaining = (remaining: number) =>
  remaining >= 0 ? { text: `Restan ${remaining.toFixed(1)}`, isExcess: false } : { text: `Exceso ${Math.abs(remaining).toFixed(1)}`, isExcess: true };

const Row = ({
  label,
  objective,
  used,
  remaining,
  isPortion = false,
}: {
  label: string;
  objective: number;
  used: number;
  remaining: number;
  isPortion?: boolean;
}) => {
  const status = formatRemaining(remaining);
  return (
    <Box
      sx={{
        p: 1,
        borderRadius: 2,
        border: "1px solid",
        borderColor: status.isExcess ? "error.main" : "divider",
        bgcolor: status.isExcess ? "error.light" : "grey.50",
      }}
    >
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={700} color={status.isExcess ? "error.main" : "text.primary"}>
        {isPortion ? `Presupuesto: ${objective.toFixed(1)}` : `Obj: ${objective.toFixed(1)} g`}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {isPortion ? `Usadas: ${used.toFixed(1)} · ${status.text}` : `Usado: ${used.toFixed(1)} g · ${status.text}`}
      </Typography>
    </Box>
  );
};

const MacrosPorcionesCard = ({ macrosObjective, macrosUsed, portionsBudget, portionsUsed }: Props) => {
  const macrosRemaining = {
    protein: macrosObjective.protein - macrosUsed.protein,
    carbs: macrosObjective.carbs - macrosUsed.carbs,
    fat: macrosObjective.fat - macrosUsed.fat,
  };

  const portionsRemaining = {
    protein: portionsBudget.protein - portionsUsed.protein,
    carbs: portionsBudget.carbs - portionsUsed.carbs,
    fat: portionsBudget.fat - portionsUsed.fat,
  };

  return (
    <Card variant="outlined" sx={{ borderRadius: 3, borderColor: "divider" }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Stack spacing={2}>
          <Typography variant="subtitle1" fontWeight={700}>
            Macros y porciones
          </Typography>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <Stack flex={1} spacing={1}>
              <Typography variant="caption" color="text.secondary">
                Macros (g)
              </Typography>
              <Stack spacing={1}>
                <Row label="Proteína" objective={macrosObjective.protein} used={macrosUsed.protein} remaining={macrosRemaining.protein} />
                <Row label="Carbs" objective={macrosObjective.carbs} used={macrosUsed.carbs} remaining={macrosRemaining.carbs} />
                <Row label="Grasas" objective={macrosObjective.fat} used={macrosUsed.fat} remaining={macrosRemaining.fat} />
              </Stack>
            </Stack>
            <Stack flex={1} spacing={1}>
              <Typography variant="caption" color="text.secondary">
                Porciones
              </Typography>
              <Stack spacing={1}>
                <Row label="Proteína" objective={portionsBudget.protein} used={portionsUsed.protein} remaining={portionsRemaining.protein} isPortion />
                <Row label="Carbs" objective={portionsBudget.carbs} used={portionsUsed.carbs} remaining={portionsRemaining.carbs} isPortion />
                <Row label="Grasas" objective={portionsBudget.fat} used={portionsUsed.fat} remaining={portionsRemaining.fat} isPortion />
              </Stack>
            </Stack>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
};

export default MacrosPorcionesCard;
