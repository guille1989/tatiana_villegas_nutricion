import { Alert, Stack, Typography } from "@mui/material";

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
  const excessItems = [
    remaining.protein < 0 ? `Prote +${Math.abs(remaining.protein).toFixed(1)}` : null,
    remaining.carbs < 0 ? `Carbs +${Math.abs(remaining.carbs).toFixed(1)}` : null,
    remaining.fat < 0 ? `Grasas +${Math.abs(remaining.fat).toFixed(1)}` : null,
  ].filter(Boolean);

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
