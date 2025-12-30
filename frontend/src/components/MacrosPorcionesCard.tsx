import { Card, CardContent, Stack, Typography, Box } from "@mui/material";
import { getMacroState, macroStateColor, type MacroKey } from "../lib/macroStatus";

type Macros = { protein: number; carbs: number; fat: number };

type Props = {
  macrosObjective: Macros;
  macrosUsed: Macros;
  portionsBudget: Macros;
  portionsUsed: Macros;
};

const Row = ({
  label,
  objective,
  used,
  remaining,
  isPortion = false,
  macroKey,
}: {
  label: string;
  objective: number;
  used: number;
  remaining: number;
  isPortion?: boolean;
  macroKey: MacroKey;
}) => {
  const unitSize = isPortion ? 1 : macroKey === "protein" ? 10 : macroKey === "carbs" ? 15 : 5;
  const state = getMacroState(remaining, objective, macroKey, unitSize);
  const isExcess = state === "over";
  const isOk = state === "ok";
  const text =
    state === "over"
      ? `Exceso ${Math.abs(remaining).toFixed(1)}`
      : state === "pending"
      ? `Restan ${remaining.toFixed(1)}`
      : "Cumplido";
  const borderColor = macroStateColor[state];
  return (
    <Box
      sx={{
        p: 1,
        borderRadius: 2,
        border: "1px solid",
        borderColor,
        bgcolor: isExcess ? "error.light" : "grey.50",
      }}
    >
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={700} color={borderColor}>
        {isPortion ? `Presupuesto: ${objective.toFixed(1)}` : `Obj: ${objective.toFixed(1)} g`}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {isPortion
          ? isOk
            ? "Cumplido"
            : `Usadas: ${used.toFixed(1)} · ${text}`
          : isOk
          ? "Cumplido"
          : `Usado: ${used.toFixed(1)} g · ${text}`}
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
                <Row label="Proteína" objective={macrosObjective.protein} used={macrosUsed.protein} remaining={macrosRemaining.protein} macroKey="protein" />
                <Row label="Carbs" objective={macrosObjective.carbs} used={macrosUsed.carbs} remaining={macrosRemaining.carbs} macroKey="carbs" />
                <Row label="Grasas" objective={macrosObjective.fat} used={macrosUsed.fat} remaining={macrosRemaining.fat} macroKey="fat" />
              </Stack>
            </Stack>
            <Stack flex={1} spacing={1}>
              <Typography variant="caption" color="text.secondary">
                Porciones
              </Typography>
              <Stack spacing={1}>
                <Row label="Proteína" objective={portionsBudget.protein} used={portionsUsed.protein} remaining={portionsRemaining.protein} isPortion macroKey="protein" />
                <Row label="Carbs" objective={portionsBudget.carbs} used={portionsUsed.carbs} remaining={portionsRemaining.carbs} isPortion macroKey="carbs" />
                <Row label="Grasas" objective={portionsBudget.fat} used={portionsUsed.fat} remaining={portionsRemaining.fat} isPortion macroKey="fat" />
              </Stack>
            </Stack>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
};

export default MacrosPorcionesCard;

