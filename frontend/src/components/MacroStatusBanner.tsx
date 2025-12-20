import { Alert, Stack, Typography } from "@mui/material";
import { getMacroState } from "../lib/macroStatus";

type Macros = { protein: number; carbs: number; fat: number };

type Props = {
  budget: Macros;
  used: Macros;
};

const MacroStatusBanner = ({ budget, used }: Props) => {
  const remaining = {
    protein: budget.protein - used.protein,
    carbs: budget.carbs - used.carbs,
    fat: budget.fat - used.fat,
  };

  const excessItems = (["protein", "carbs", "fat"] as const)
    .map((key) => {
      const state = getMacroState(remaining[key], budget[key]);
      if (state !== "over") return null;
      return `${key === "protein" ? "Prote" : key === "carbs" ? "Carbs" : "Grasas"} +${Math.abs(
        remaining[key]
      ).toFixed(1)}`;
    })
    .filter(Boolean) as string[];

  if (excessItems.length === 0) return null;

  return (
    <Alert severity="warning" variant="outlined" sx={{ borderRadius: 2 }}>
      <Stack spacing={0.5}>
        <Typography variant="body2" fontWeight={700}>
          Te estás pasando en:
        </Typography>
        <Typography variant="body2">{excessItems.join(" · ")}</Typography>
      </Stack>
    </Alert>
  );
};

export default MacroStatusBanner;
