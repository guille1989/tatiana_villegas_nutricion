import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Card,
  Container,
  Fade,
  Paper,
  Snackbar,
  Stack,
  Typography,
  useMediaQuery,
  Chip,
  LinearProgress,
} from "@mui/material";
import dayjs from "dayjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@mui/material/styles";
import { useNavigate, useParams } from "react-router-dom";
import DayEditDialog from "../components/DayEditDialog";
import { calculateDayFromBase } from "../lib/calc";
import { getPlan, upsertOverride } from "../lib/api";
import MealBuilder from "../components/MealBuilder";
import { getMacroState, macroStateColor } from "../lib/macroStatus";
import type { Assessment, DayOverride, Meal, Plan } from "../types";

const PlanDetailPage = () => {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const detailRef = useRef<HTMLDivElement | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [overrides, setOverrides] = useState<DayOverride[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mealsByDate, setMealsByDate] = useState<Record<string, Meal[]>>({});

  useEffect(() => {
    if (!planId) return;
    getPlan(planId)
      .then(
        ({
          plan: fetchedPlan,
          overrides: fetchedOverrides,
          assessment: baseAssessment,
        }) => {
          setPlan(fetchedPlan);
          setOverrides(fetchedOverrides ?? []);
          setAssessment(baseAssessment ?? null);
          const mealsMap: Record<string, Meal[]> = {};
          (fetchedOverrides ?? []).forEach((ov) => {
            if (ov.meals) mealsMap[ov.date] = ov.meals as Meal[];
          });
          setMealsByDate(mealsMap);
        }
      )
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "No se pudo cargar el plan"
        )
      );
  }, [planId]);

  const dates = useMemo(() => {
    if (!plan) return [];
    const start = dayjs(plan.startDate);
    return Array.from({ length: plan.days }, (_, idx) =>
      start.add(idx, "day").format("YYYY-MM-DD")
    );
  }, [plan]);

  useEffect(() => {
    if (dates.length && !selectedDate) {
      setSelectedDate(dates[0]);
    }
  }, [dates, selectedDate]);

  useEffect(() => {
    if (selectedDate && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedDate]);

  const baseOutputs = assessment?.outputs;
  const baseInputs = assessment?.inputs;

  const handleSaved = (record: DayOverride) => {
    setOverrides((prev) => {
      const filtered = prev.filter((item) => item.date !== record.date);
      return [...filtered, record];
    });
    setEditingDate(null);
    setSnackbar("Dia actualizado");
  };

  const handleDeleted = (date: string) => {
    setOverrides((prev) => prev.filter((item) => item.date !== date));
    setEditingDate(null);
    setSnackbar("Override eliminado");
  };

  const computeOutputs = (override?: DayOverride) => {
    if (!baseInputs) return baseOutputs;
    if (override?.computed) return override.computed;
    if (override) {
      try {
        return calculateDayFromBase(baseInputs, override.overrides);
      } catch {
        return baseOutputs;
      }
    }
    return baseOutputs;
  };

  const getTrainingCount = (override?: DayOverride) => {
    const dayType =
      override?.overrides.dayType ?? baseInputs?.dayType ?? "rest";
    if (dayType !== "training") return 0;
    const sessions =
      override?.overrides.trainings?.filter(
        (item) => !!item && (item?.type || item?.durationMin)
      ) ??
      ((override as any)?.overrides?.training
        ? [override?.overrides.training]
        : []);
    if (sessions.length > 0) return sessions.length;
    if (baseInputs?.dayType === "training" && baseInputs.trainingType) return 1;
    return 0;
  };

  const selectedOverride = overrides.find((item) => item.date === selectedDate);
  const selectedOutputs = computeOutputs(selectedOverride);
  const selectedTrainingCount = getTrainingCount(selectedOverride);
  const selectedDayType =
    selectedTrainingCount > 0
      ? "training"
      : selectedOverride?.overrides.dayType ?? baseInputs?.dayType ?? "rest";
  const selectedTrainingLabel =
    selectedDayType === "training"
      ? selectedTrainingCount > 1
        ? `Entreno ${selectedTrainingCount}x`
        : "Entreno"
      : "Descanso";


  const defaultMealsTemplate: Meal[] = [
    {
      key: "breakfast",
      name: "Desayuno",
      items: [],
      totals: { protein: 0, carbs: 0, fat: 0, kcal: 0 },
    },
    {
      key: "snack",
      name: "Merienda",
      items: [],
      totals: { protein: 0, carbs: 0, fat: 0, kcal: 0 },
    },
    {
      key: "lunch",
      name: "Comida",
      items: [],
      totals: { protein: 0, carbs: 0, fat: 0, kcal: 0 },
    },
    {
      key: "snack2",
      name: "Merienda 2",
      items: [],
      totals: { protein: 0, carbs: 0, fat: 0, kcal: 0 },
    },
    {
      key: "dinner",
      name: "Cena",
      items: [],
      totals: { protein: 0, carbs: 0, fat: 0, kcal: 0 },
    },
  ];

  const withDefaults = (meals?: Meal[]) => {
    const map = new Map((meals ?? []).map((m) => [m.key, m]));
    return defaultMealsTemplate.map((tpl) => map.get(tpl.key) ?? { ...tpl });
  };

  const totalsFromMeals = (meals: Meal[]) =>
    meals.reduce(
      (acc, meal) => ({
        protein: acc.protein + meal.totals.protein,
        carbs: acc.carbs + meal.totals.carbs,
        fat: acc.fat + meal.totals.fat,
        kcal: acc.kcal + meal.totals.kcal,
      }),
      { protein: 0, carbs: 0, fat: 0, kcal: 0 },
    );

  type DayStatus = "pending" | "ok" | "over";

  const statusColorMap: Record<DayStatus, string> = {
    pending: macroStateColor.pending,
    ok: macroStateColor.ok,
    over: macroStateColor.over,
  };

  const getDayStatus = (
    remaining: { protein: number; carbs: number; fat: number },
    budget: { protein: number; carbs: number; fat: number }
  ): DayStatus => {
    const states: DayStatus[] = (["protein", "carbs", "fat"] as const).map((key) =>
      getMacroState(remaining[key], budget[key])
    ) as DayStatus[];
    if (states.includes("over")) return "over";
    if (states.every((s) => s === "ok")) return "ok";
    return "pending";
  };

  const getDayMeals = (date: string) =>
    withDefaults(mealsByDate[date] || (overrides.find((o) => o.date === date)?.meals as Meal[] | undefined));

  const rawMeals =
    (selectedDate && mealsByDate[selectedDate]) ||
    (selectedOverride?.meals as Meal[] | undefined) ||
    defaultMealsTemplate;
const currentMeals = withDefaults(rawMeals);
const currentTotals = currentMeals.reduce(
  (acc, meal) => ({
    protein: acc.protein + meal.totals.protein,
    carbs: acc.carbs + meal.totals.carbs,
    fat: acc.fat + meal.totals.fat,
    kcal: acc.kcal + meal.totals.kcal,
  }),
  { protein: 0, carbs: 0, fat: 0, kcal: 0 }
);


  const handleMealsChange = (meals: Meal[]) => {
    if (!selectedDate) return;
    setMealsByDate((prev) => ({ ...prev, [selectedDate]: meals }));
  };

  const handleSaveMeals = async () => {
    if (!planId || !selectedDate || !baseInputs) return;
    const mealsToSave = currentMeals;
    const baseOverride = selectedOverride?.overrides ?? {
      dayType: baseInputs.dayType,
      activityLevel: baseInputs.activityLevel,
    };
    try {
      const record = await upsertOverride({
        planId,
        date: selectedDate,
        overrides: baseOverride,
        meals: mealsToSave,
      });
      handleSaved(record);
      setMealsByDate((prev) => ({ ...prev, [selectedDate]: mealsToSave }));
      setSnackbar("Comidas guardadas");
    } catch (err) {
      console.error(err);
      setError("No se pudieron guardar las comidas");
    }
  };

  const getDayData = (date: string) => {
    const override = overrides.find((item) => item.date === date);
    const outputs = computeOutputs(override);
    const dayType =
      override?.overrides.dayType ?? baseInputs?.dayType ?? "rest";
    return {
      outputs,
      dayType,
      override,
      trainingCount: getTrainingCount(override),
    };
  };

  const MacroDonut = ({
    protein,
    carbs,
    fats,
    kcal,
  }: {
    protein: number;
    carbs: number;
    fats: number;
    kcal: number;
  }) => {
    const size = 92;
    const stroke = 12;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;

    const proteinKcal = protein * 4;
    const carbsKcal = carbs * 4;
    const fatsKcal = fats * 9;
    const total = proteinKcal + carbsKcal + fatsKcal;

    const getDash = (val: number) =>
      total > 0 ? (val / total) * circumference : 0;

    const segments = [
      { val: proteinKcal, color: theme.palette.primary.main },
      { val: carbsKcal, color: theme.palette.success.main },
      { val: fatsKcal, color: theme.palette.warning.main },
    ];

    let offset = 0;

    return (
      <Box
        sx={{ position: "relative", width: size, height: size, minWidth: size }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={theme.palette.grey[200]}
            strokeWidth={stroke}
          />
          {total === 0 ? (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={theme.palette.grey[400]}
              strokeWidth={stroke}
            />
          ) : (
            segments.map((seg, idx) => {
              const dash = getDash(seg.val);
              const circle = (
                <circle
                  key={idx}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="round"
                />
              );
              offset += dash;
              return circle;
            })
          )}
        </svg>
        <Stack
          alignItems="center"
          justifyContent="center"
          sx={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          <Typography variant="h6" fontWeight={800} lineHeight={1}>
            {kcal}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            kcal
          </Typography>
        </Stack>
      </Box>
    );
  };

  if (!planId) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="error">Plan no encontrado.</Alert>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Stack spacing={2}>
          <Alert severity="warning">{error}</Alert>
          <Button variant="contained" onClick={() => navigate("/plans")}>
            Volver a planes
          </Button>
        </Stack>
      </Container>
    );
  }

  if (!plan) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography>Cargando...</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
      <Stack spacing={3}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          justifyContent="space-between"
          spacing={1.5}
          alignItems={{ xs: "flex-start", md: "center" }}
          sx={{ pt: 1 }}
        >
          <Stack spacing={0.5}>
            <Typography variant="h5" fontWeight={800}>
              Plan {plan.days} dias
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Inicio: {dayjs(plan.startDate).format("DD MMM YYYY")} · Duracion:{" "}
              {plan.days} dias
            </Typography>
            {assessment && assessment.id !== plan.baseAssessmentId && (
              <Typography variant="caption" color="text.secondary">
                Este plan se creo con otra evaluacion. Se usa la asociada al
                plan.
              </Typography>
            )}
          </Stack>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            width={{ xs: "100%", md: "auto" }}
          >
            <Button
              variant="outlined"
              onClick={() => navigate("/plans")}
              fullWidth={!isDesktop}
            >
              Volver
            </Button>
            <Button
              variant="contained"
              onClick={() => navigate("/wizard")}
              fullWidth={!isDesktop}
            >
              Abrir wizard
            </Button>
          </Stack>
        </Stack>

        {!baseOutputs && (
          <Alert severity="warning">
            No hay outputs base cargados. Guarda una evaluacion y vuelve a abrir
            el plan.
          </Alert>
        )}

        {/* Week switcher */}
        <Stack
          direction="row"
          spacing={1.25}
          sx={{
            overflowX: "auto",
            pb: 0.5,
            "&::-webkit-scrollbar": { display: "none" },
            scrollSnapType: { xs: "x mandatory", md: "none" },
          }}
        >
          {dates.map((date) => {
            const day = dayjs(date);
            const { outputs, dayType, trainingCount } = getDayData(date);
            const isSelected = selectedDate === date;
            const isTraining = trainingCount > 0 || dayType === "training";
            const kcal = outputs?.kcalObjectiveDay;
            const trainingLabel =
              trainingCount > 1
                ? `Entreno ${trainingCount}x`
                : isTraining
                ? "Entreno"
                : "Descanso";
            const dayMeals = getDayMeals(date);
            const dayTotals = totalsFromMeals(dayMeals);
            const budgetPortions = outputs
              ? {
                  protein: outputs.protein / 10,
                  carbs: outputs.carbsAdjusted / 15,
                  fat: outputs.fatsAdjusted / 5,
                }
              : { protein: 0, carbs: 0, fat: 0 };
            const remainingPortions = outputs
              ? {
                  protein: outputs.protein / 10 - dayTotals.protein / 10,
                  carbs: outputs.carbsAdjusted / 15 - dayTotals.carbs / 15,
                  fat: outputs.fatsAdjusted / 5 - dayTotals.fat / 5,
                }
              : { protein: 0, carbs: 0, fat: 0 };
            const status = getDayStatus(remainingPortions, budgetPortions);
            const statusColor = statusColorMap[status];
            const statusLabel =
              status === "ok"
                ? "Cumplido"
                : status === "over"
                ? "Excedido"
                : "Pendiente";
            const circleText =
              trainingCount > 1 ? `${trainingCount}x` : isTraining ? "✓" : "";
            return (
              <ButtonBase
                key={date}
                onClick={() => setSelectedDate(date)}
                sx={{
                  borderRadius: 3,
                  px: 1,
                  py: 0.5,
                  scrollSnapAlign: "start",
                  border: "1px solid",
                  borderColor: isSelected ? "primary.main" : "transparent",
                  bgcolor: isSelected ? "primary.main" + "0D" : "transparent",
                  transition: "all 0.2s ease",
                  minWidth: 82,
                  "&:hover": {
                    borderColor: "primary.light",
                    bgcolor: "primary.main" + "0A",
                  },
                }}
                aria-label={`Seleccionar ${day.format("dddd")} ${
                  isTraining ? trainingLabel : "descanso"
                } ${kcal ?? ""} kcal`}
              >
                <Stack spacing={0.5} alignItems="center" width="100%">
                  <Typography variant="caption" color="text.secondary">
                    {day.format("ddd").toUpperCase()}
                  </Typography>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      display: "grid",
                      placeItems: "center",
                      bgcolor: isTraining ? "transparent" : "grey.300",
                      color: isTraining ? "primary.main" : "grey.50",
                      border: `2px solid ${statusColor}`,
                      fontWeight: 700,
                      boxShadow: isSelected
                        ? `0 0 0 3px ${statusColor}33`
                        : "0 0 0 1px transparent",
                      transition: "all 0.2s ease",
                      position: "relative",
                    }}
                    title={`${statusLabel}. P ${remainingPortions.protein.toFixed(
                      1
                    )}, C ${remainingPortions.carbs.toFixed(
                      1
                    )}, G ${remainingPortions.fat.toFixed(1)}`}
                  >
                    {circleText}
                    <Box
                      sx={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        bgcolor: statusColor,
                      }}
                    />
                  </Box>
                  <Chip
                    size="small"
                    label={isTraining ? trainingLabel : "Descanso"}
                    color={isTraining ? "primary" : "default"}
                    variant={isTraining ? "outlined" : "filled"}
                  />
                  {kcal !== undefined && (
                    <Typography variant="caption" color="text.secondary">
                      {kcal} kcal
                    </Typography>
                  )}
                </Stack>
              </ButtonBase>
            );
          })}
        </Stack>

        {/* Summary card */}
        {selectedOutputs && (
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              borderRadius: 3,
              borderColor: "divider",
              scrollMarginTop: 16,
            }}
            ref={detailRef}
          >
            <Stack
              direction={{ xs: "column", sm: "row" }}
              justifyContent="space-between"
              alignItems={{ xs: "flex-start", sm: "center" }}
              spacing={1}
            >
              <Box>
                <Typography variant="subtitle1" fontWeight={800}>
                  {dayjs(selectedDate).format("dddd, DD MMM YYYY")}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  EEE: {selectedOutputs.eee} kcal
                </Typography>
              </Box>
              <Chip
                label={selectedTrainingLabel}
                color={selectedDayType === "training" ? "primary" : "default"}
                variant={selectedDayType === "training" ? "outlined" : "filled"}
                sx={{ alignSelf: { xs: "flex-start", sm: "center" } }}
              />
            </Stack>
          </Paper>
        )}

        {/* Detail card */}
        <Fade in={!!selectedOutputs}>
          <div>
            {selectedOutputs && (
              <Card
                variant="outlined"
                sx={{
                  borderRadius: 3,
                  borderColor: "divider",
                  boxShadow: "0 6px 24px rgba(0,0,0,0.06)",
                  p: { xs: 2, md: 2.5 },
                }}
              >
                <Stack spacing={2}>
                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    alignItems={{ xs: "flex-start", md: "center" }}
                    justifyContent="space-between"
                    spacing={1}
                  >
                    <Box>
                      <Typography variant="subtitle1" fontWeight={700}>
                        Resumen nutricional
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Kcal objetivo del día
                      </Typography>
                    </Box>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() =>
                        selectedDate && setEditingDate(selectedDate)
                      }
                      aria-label="Editar dia"
                      sx={{ alignSelf: { xs: "stretch", md: "center" } }}
                    >
                      Editar día
                    </Button>
                  </Stack>

                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    alignItems={{ xs: "center", md: "center" }}
                    spacing={{ xs: 2, md: 3 }}
                  >
                    <MacroDonut
                      protein={selectedOutputs.protein}
                      carbs={selectedOutputs.carbsAdjusted}
                      fats={selectedOutputs.fatsAdjusted}
                      kcal={selectedOutputs.kcalObjectiveDay}
                    />

                    <Stack spacing={1} width="100%">
                      <Typography variant="body2" color="text.secondary">
                        {`Consumidas: ${currentTotals.kcal.toFixed(0)} / ${selectedOutputs.kcalObjectiveDay} kcal`}
                      </Typography>
                      <Box
                        sx={{
                          display: "grid",
                          gap: 1,
                          gridTemplateColumns: {
                            xs: "repeat(1, minmax(0,1fr))",
                            sm: "repeat(3, minmax(0,1fr))",
                          },
                        }}
                      >
                        {(["protein", "carbs", "fat"] as const).map((key) => {
                          const budget =
                            key === "protein"
                              ? selectedOutputs.protein / 10
                              : key === "carbs"
                              ? selectedOutputs.carbsAdjusted / 15
                              : selectedOutputs.fatsAdjusted / 5;
                          const used =
                            key === "protein"
                              ? currentTotals.protein / 10
                              : key === "carbs"
                              ? currentTotals.carbs / 15
                              : currentTotals.fat / 5;
                          const remainingRaw = budget - used;
                          const EPS = Math.max(1e-6, budget * 0.05);
                          const remaining =
                            Math.abs(remainingRaw) < EPS ? 0 : remainingRaw;
                          const percent =
                            budget > 0
                              ? Math.min((used / budget) * 100, 140)
                              : 0;
                          const label =
                            key === "protein"
                              ? "Proteína"
                              : key === "carbs"
                              ? "Carbohidratos"
                              : "Grasas";
                          const objective =
                            key === "protein"
                              ? selectedOutputs.protein
                              : key === "carbs"
                              ? selectedOutputs.carbsAdjusted
                              : selectedOutputs.fatsAdjusted;
                          const isExcess = remaining < -EPS;
                          const isPending = remaining > EPS;
                          const isCompleted = !isExcess && !isPending;
                          const statusText = isExcess
                            ? `Exceso ${Math.abs(remaining).toFixed(1)}`
                            : isPending
                            ? `Restan ${remaining.toFixed(1)}`
                            : "Completado";
                          return (
                            <Box
                              key={key}
                              sx={{
                                p: 1,
                                borderRadius: 2,
                                borderStyle: "solid",
                                borderWidth: 2,
                                borderColor: isExcess
                                  ? "error.main"
                                  : isCompleted
                                  ? "#A5D6A7" // light green border when completed
                                  : isPending
                                  ? "#FFF59D" // soft yellow border when pending
                                  : "divider",
                                bgcolor: isExcess
                                  ? "error.light"
                                  : isCompleted
                                  ? "#E8F5E9" // very light green background when completed
                                  : isPending
                                  ? "#FFFDE7" // very light yellow background when pending
                                  : "grey.50",
                              }}
                            >
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                fontWeight={700}
                                fontSize={13}
                              >
                                {`${label} Obj: ${objective.toFixed(1)} g | ${budget.toFixed(1)} porciones`}
                              </Typography>
                              <Stack
                                direction="row"
                                justifyContent="space-between"
                                alignItems="center"
                                marginTop={1}
                              >
                                <Typography
                                  variant="body1"
                                  fontWeight={700}
                                  color={isExcess ? "error.main" : "text.primary"}
                                >
                                  {statusText}
                                </Typography>
                                <Chip
                                  size="small"
                                  color={isExcess ? "error" : "default"}
                                  label={`de ${budget.toFixed(1)} porciones`}
                                  variant={isExcess ? "filled" : "outlined"}
                                />
                              </Stack>
                              <LinearProgress
                                variant="determinate"
                                value={percent}
                                sx={{
                                  mt: 0.5,
                                  height: 6,
                                  borderRadius: 999,
                                  width: "100%",
                                  mx: "auto",
                                  marginTop: 1,
                                  bgcolor: isExcess
                                    ? "error.light"
                                    : isCompleted
                                    ? "#E8F5E9"
                                    : isPending
                                    ? "#FFFDE7"
                                    : undefined,
                                  "& .MuiLinearProgress-bar": {
                                    bgcolor: isExcess
                                      ? "error.main"
                                      : isCompleted
                                      ? "#66BB6A"
                                      : isPending
                                      ? "#FBC02D"
                                      : undefined,
                                  },
                                }}
                              />
                              {isExcess && (
                                <Typography variant="caption" color="error.main">
                                  Te pasaste en {Math.abs(remaining).toFixed(1)} porciones
                                </Typography>
                              )}
                            </Box>
                          );
                        })}
                      </Box>
                      
                      {/* 
                      <Stack spacing={1} sx={{ mt: 1 }}>
                        {(
                          [
                            { key: "protein", label: "Proteína" },
                            { key: "carbs", label: "Carbs" },
                            { key: "fat", label: "Grasas" },
                          ] as const
                        ).map(({ key, label }) => {
                          const objective =
                            key === "protein"
                              ? selectedOutputs.protein
                              : key === "carbs"
                                ? selectedOutputs.carbsAdjusted
                                : selectedOutputs.fatsAdjusted;
                          const used =
                            key === "protein"
                              ? currentMeals.reduce(
                                  (acc, m) => acc + m.totals.protein,
                                  0
                                )
                              : key === "carbs"
                                ? currentMeals.reduce(
                                    (acc, m) => acc + m.totals.carbs,
                                    0
                                  )
                                : currentMeals.reduce(
                                    (acc, m) => acc + m.totals.fat,
                                    0
                                  );
                          const remaining = objective - used;
                          return (
                            <Stack
                              key={key}
                              direction="row"
                              justifyContent="space-between"
                              alignItems="center"
                              spacing={1}
                            >
                              <Typography variant="body2" fontWeight={600}>
                                {label}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                Objetivo: {objective.toFixed(1)} g · Usado:{" "}
                                {used.toFixed(1)} g · Restan:{" "}
                                {remaining.toFixed(1)} g
                              </Typography>
                            </Stack>
                          );
                        })}
                      </Stack>
                        */}
                    </Stack>
                  </Stack>
                </Stack>
              </Card>
            )}
          </div>
        </Fade>

        {selectedOutputs && (
          <Stack spacing={2}>
            <Card
              variant="outlined"
              sx={{
                borderRadius: 3,
                borderColor: "divider",
                p: { xs: 2, md: 2.5 },
              }}
            >
              <Stack spacing={2}>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Typography variant="subtitle1" fontWeight={700}>
                    Comidas del día
                  </Typography>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={handleSaveMeals}
                  >
                    Guardar comidas
                  </Button>
                </Stack>
                <MealBuilder
                  meals={currentMeals}
                  onChange={handleMealsChange}
                  budgetMacros={{
                    protein: selectedOutputs.protein,
                    carbs: selectedOutputs.carbsAdjusted,
                    fat: selectedOutputs.fatsAdjusted,
                  }}
                  onError={(msg) => setSnackbar(msg)}
                />
              </Stack>
            </Card>
            {/* 
            <MacrosPorcionesCard
              macrosObjective={{
                protein: selectedOutputs.protein,
                carbs: selectedOutputs.carbsAdjusted,
                fat: selectedOutputs.fatsAdjusted,
              }}
              macrosUsed={{
                protein: currentTotals.protein,
                carbs: currentTotals.carbs,
                fat: currentTotals.fat,
              }}
              portionsBudget={{
                protein: selectedOutputs.protein / 10,
                carbs: selectedOutputs.carbsAdjusted / 15,
                fat: selectedOutputs.fatsAdjusted / 5,
              }}
              portionsUsed={{
                protein: currentTotals.protein / 10,
                carbs: currentTotals.carbs / 15,
                fat: currentTotals.fat / 5,
              }}
            />*/}
          </Stack>
        )}
      </Stack>

      {editingDate && baseInputs && (
        <DayEditDialog
          open
          planId={planId}
          date={editingDate}
          baseInputs={baseInputs}
          existingOverride={overrides.find((item) => item.date === editingDate)}
          onClose={() => setEditingDate(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}

      <Snackbar
        open={!!snackbar}
        autoHideDuration={2500}
        message={snackbar}
        onClose={() => setSnackbar(null)}
      />
    </Container>
  );
};

export default PlanDetailPage;
