import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  ButtonBase,
  IconButton,
  Card,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Fade,
  Paper,
  Snackbar,
  Stack,
  Typography,
  Chip,
  LinearProgress,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import dayjs from "dayjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@mui/material/styles";
import { useNavigate, useParams } from "react-router-dom";
import DayEditDialog from "../components/DayEditDialog";
import { calculateDayFromBase } from "../lib/calc";
import {
  createMealTemplate,
  getPlan,
  listMealTemplates,
  upsertOverride,
} from "../lib/api";
import MealBuilder from "../components/MealBuilder";
import { getMacroState, getTol, macroStateColor } from "../lib/macroStatus";
import {
  distributeMacros,
  getMealsByCount,
  getWeightsByCount,
  type MealCount,
} from "../lib/meals";
import type {
  Assessment,
  CalculationOutputs,
  DayOverride,
  Meal,
  MealTemplate,
  Plan,
  PlanMacroOverride,
} from "../types";

const PlanDetailPage = () => {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const detailRef = useRef<HTMLDivElement | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [overrides, setOverrides] = useState<DayOverride[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [weekIndex, setWeekIndex] = useState(0);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mealsByDate, setMealsByDate] = useState<Record<string, Meal[]>>({});
  const [mealLibrary, setMealLibrary] = useState<MealTemplate[]>([]);
  const [mealLibraryLoading, setMealLibraryLoading] = useState(false);
  const [mealLibraryError, setMealLibraryError] = useState<string | null>(null);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneSaving, setCloneSaving] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [cloneSourceId, setCloneSourceId] = useState<string | null>(null);
  const [cloneTargetPlanId, setCloneTargetPlanId] = useState<string | null>(
    null
  );
  const [cloneTargetDate, setCloneTargetDate] = useState<string | null>(null);
  const [cloneTargetMealKey, setCloneTargetMealKey] = useState<
    Meal["key"] | null
  >(null);
  const [cloneTargetMealName, setCloneTargetMealName] = useState<string | null>(
    null
  );
  const [cloneExpandedId, setCloneExpandedId] = useState<string | null>(null);

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

  const weeks = useMemo(() => {
    const chunks: string[][] = [];
    for (let i = 0; i < dates.length; i += 7) {
      chunks.push(dates.slice(i, i + 7));
    }
    return chunks;
  }, [dates]);

  const visibleDates = weeks[weekIndex] ?? [];

  useEffect(() => {
    if (!dates.length) return;
    if (!selectedDate || !dates.includes(selectedDate)) {
      setSelectedDate(dates[0]);
    }
  }, [dates, selectedDate]);

  useEffect(() => {
    if (weeks.length === 0) {
      if (weekIndex !== 0) setWeekIndex(0);
      return;
    }
    if (weekIndex > weeks.length - 1) {
      setWeekIndex(weeks.length - 1);
    }
  }, [weeks.length, weekIndex]);

  useEffect(() => {
    if (!selectedDate) return;
    const idx = weeks.findIndex((week) => week.includes(selectedDate));
    if (idx !== -1 && idx !== weekIndex) {
      setWeekIndex(idx);
    }
  }, [selectedDate, weeks, weekIndex]);

  useEffect(() => {
    if (selectedDate && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedDate]);

  useEffect(() => {
    if (!cloneOpen) return;
    if (!mealLibraryLoading && mealLibrary.length === 0) {
      void loadMealLibrary();
    }
  }, [cloneOpen, mealLibraryLoading, mealLibrary.length]);

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

  const getMacroOverrideForDate = (
    date: string | null,
    overrides: PlanMacroOverride[] | undefined
  ) => {
    if (!date || !overrides || overrides.length === 0) return null;
    const filtered = overrides.filter((item) => item.effectiveFrom <= date);
    if (filtered.length === 0) return null;
    return filtered.reduce((latest, item) =>
      item.effectiveFrom > latest.effectiveFrom ? item : latest
    );
  };

  const calcKcalFromMacros = (macros: {
    protein: number;
    carbsAdjusted: number;
    fatsAdjusted: number;
  }) =>
    Math.round(
      macros.protein * 4 + macros.carbsAdjusted * 4 + macros.fatsAdjusted * 9
    );

  const round1 = (value: number) => Math.round(value * 10) / 10;

  const adjustCarbFat = ({
    protein,
    fats,
    carbs,
    kcalObjectiveDay,
    dayType,
  }: {
    protein: number;
    fats: number;
    carbs: number;
    kcalObjectiveDay: number;
    dayType: "training" | "rest";
  }) => {
    const carbFactor = dayType === "training" ? 1.2 : 0.85;
    const fatFactor = dayType === "training" ? 0.85 : 1.2;

    const protKcal = protein * 4;
    const remaining = Math.max(kcalObjectiveDay - protKcal, 0);

    const baseCarbKcal = Math.max(carbs, 0) * 4;
    const baseFatKcal = Math.max(fats, 0) * 9;

    const targCarb = baseCarbKcal * carbFactor;
    const targFat = baseFatKcal * fatFactor;
    const denom = targCarb + targFat;

    if (denom <= 0) {
      return { carbsAdjusted: 0, fatsAdjusted: 0 };
    }

    const scale = remaining / denom;
    const carbsAdjusted = round1((targCarb * scale) / 4);
    const fatsAdjusted = round1((targFat * scale) / 9);
    return { carbsAdjusted, fatsAdjusted };
  };

  const applyMacroOverride = (
    outputs: CalculationOutputs | undefined,
    date: string | null,
    dayType: "training" | "rest"
  ) => {
    if (!outputs) return outputs;
    const override = getMacroOverrideForDate(date, plan?.macroOverrides);
    if (!override) return outputs;
    const kcalObjectiveDay =
      calcKcalFromMacros(override.macros) + (outputs.eee ?? 0);
    const { carbsAdjusted, fatsAdjusted } = adjustCarbFat({
      protein: override.macros.protein,
      fats: override.macros.fatsAdjusted,
      carbs: override.macros.carbsAdjusted,
      kcalObjectiveDay,
      dayType,
    });
    return {
      ...outputs,
      kcalObjectiveDay,
      protein: override.macros.protein,
      carbsAdjusted,
      fatsAdjusted,
    };
  };

  const computeOutputs = (date: string | null, override?: DayOverride) => {
    const dayType =
      override?.overrides.dayType ?? baseInputs?.dayType ?? "rest";
    if (!baseInputs)
      return applyMacroOverride(baseOutputs ?? undefined, date, dayType);
    if (override?.computed)
      return applyMacroOverride(override.computed, date, dayType);
    if (override) {
      try {
        return applyMacroOverride(
          calculateDayFromBase(baseInputs, override.overrides),
          date,
          dayType
        );
      } catch {
        return applyMacroOverride(baseOutputs ?? undefined, date, dayType);
      }
    }
    return applyMacroOverride(baseOutputs ?? undefined, date, dayType);
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
  const selectedOutputs = computeOutputs(selectedDate, selectedOverride);
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

  const canGoPrevWeek = weekIndex > 0;
  const canGoNextWeek = weekIndex < weeks.length - 1;

  const handleWeekChange = (nextIndex: number) => {
    if (weeks.length === 0) return;
    const clamped = Math.max(0, Math.min(nextIndex, weeks.length - 1));
    if (clamped === weekIndex) return;
    setWeekIndex(clamped);
    const nextDates = weeks[clamped];
    if (nextDates?.length) {
      setSelectedDate(nextDates[0]);
    }
  };

  const getMealCount = (meals?: Meal[]): MealCount | null => {
    if (!meals) return null;
    if (meals.length === 3 || meals.length === 4 || meals.length === 5) {
      return meals.length;
    }
    return null;
  };

  const mergeMealsWithTemplate = (
    meals: Meal[] | undefined,
    template: Meal[]
  ) => {
    const map = new Map((meals ?? []).map((m) => [m.key, m]));
    return template.map((tpl) => {
      const existing = map.get(tpl.key);
      if (!existing) return { ...tpl };
      return { ...existing, name: tpl.name };
    });
  };

  const totalsFromMeals = (meals: Meal[]) =>
    meals.reduce(
      (acc, meal) => ({
        protein: acc.protein + meal.totals.protein,
        carbs: acc.carbs + meal.totals.carbs,
        fat: acc.fat + meal.totals.fat,
        kcal: acc.kcal + meal.totals.kcal,
      }),
      { protein: 0, carbs: 0, fat: 0, kcal: 0 }
    );

  const formatInt = (value: number) => Math.round(value);

  const buildMealTemplateName = (
    mealName: string,
    dateLabel: string,
    usedNames: Set<string>
  ) => {
    const baseName = `${mealName} - ${dateLabel}`;
    let nextName = baseName;
    let counter = 2;
    while (usedNames.has(nextName)) {
      nextName = `${baseName} (${counter})`;
      counter += 1;
    }
    usedNames.add(nextName);
    return nextName;
  };

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
    const states: DayStatus[] = (["protein", "carbs", "fat"] as const).map(
      (key) => getMacroState(remaining[key], budget[key], key)
    ) as DayStatus[];
    if (states.includes("over")) return "over";
    if (states.every((s) => s === "ok")) return "ok";
    return "pending";
  };

  const getDayMeals = (date: string) =>
    mealsByDate[date] ||
    (overrides.find((o) => o.date === date)?.meals as Meal[] | undefined) ||
    [];

  const rawMeals =
    (selectedDate && mealsByDate[selectedDate]) ||
    (selectedOverride?.meals as Meal[] | undefined);
  const mealCount = getMealCount(rawMeals);
  const mealTemplate = mealCount ? getMealsByCount(mealCount) : [];
  const currentMeals = mealCount
    ? mergeMealsWithTemplate(rawMeals, mealTemplate)
    : [];
  const currentTotals = totalsFromMeals(currentMeals);
  const dailyMacros = selectedOutputs
    ? {
        protein: selectedOutputs.protein,
        carbs: selectedOutputs.carbsAdjusted,
        fat: selectedOutputs.fatsAdjusted,
      }
    : { protein: 0, carbs: 0, fat: 0 };
  const mealTargets = distributeMacros(
    dailyMacros,
    mealCount ? getWeightsByCount(mealCount) : []
  );

  const cloneSource = mealLibrary.find((item) => item.id === cloneSourceId);
  const cloneDisabled =
    cloneSaving ||
    !cloneSourceId ||
    !cloneTargetPlanId ||
    !cloneTargetDate ||
    !cloneTargetMealKey;

  const handleMealsChange = (meals: Meal[]) => {
    if (!selectedDate) return;
    setMealsByDate((prev) => ({ ...prev, [selectedDate]: meals }));
  };

  const handleMealCountChange = (count: MealCount) => {
    if (!selectedDate) return;
    const baseMeals =
      mealsByDate[selectedDate] ||
      (selectedOverride?.meals as Meal[] | undefined);
    const nextMeals = mergeMealsWithTemplate(baseMeals, getMealsByCount(count));
    handleMealsChange(nextMeals);
  };

  const handleEditSelectedDay = () => {
    if (!selectedDate) return;
    setEditingDate(selectedDate);
  };

  const handleSaveMeals = async (mealsOverride?: Meal[] | unknown) => {
    if (!planId || !selectedDate || !baseInputs) return;
    if (!mealCount && !Array.isArray(mealsOverride)) {
      setSnackbar("Selecciona cuantas comidas haras hoy");
      return;
    }
    const mealsToSave = Array.isArray(mealsOverride)
      ? mealsOverride
      : currentMeals;
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
      void saveMealsToLibrary(mealsToSave);
      setSnackbar("Comidas guardadas");
    } catch (err) {
      console.error(err);
      setError("No se pudieron guardar las comidas");
    }
  };

  const saveMealsToLibrary = async (meals: Meal[]) => {
    if (!selectedDate) return;
    const candidates = meals.filter((meal) => meal.items.length > 0);
    if (candidates.length === 0) return;
    let templates = mealLibrary;
    if (templates.length === 0) {
      try {
        templates = await listMealTemplates();
      } catch (err) {
        console.error(err);
        templates = [];
      }
    }
    const usedNames = new Set(templates.map((item) => item.name));
    const dateLabel = dayjs(selectedDate).format("YYYY-MM-DD");
    try {
      const created = await Promise.all(
        candidates.map((meal) =>
          createMealTemplate({
            name: buildMealTemplateName(meal.name, dateLabel, usedNames),
            items: meal.items,
            totals: meal.totals,
          })
        )
      );
      setMealLibrary((prev) => {
        const map = new Map<string, MealTemplate>();
        templates.forEach((item) => map.set(item.id, item));
        prev.forEach((item) => map.set(item.id, item));
        created.forEach((item) => map.set(item.id, item));
        return Array.from(map.values()).sort((a, b) =>
          dayjs(b.createdAt).diff(dayjs(a.createdAt))
        );
      });
    } catch (err) {
      console.error(err);
    }
  };

  const loadMealLibrary = async () => {
    setMealLibraryLoading(true);
    setMealLibraryError(null);
    try {
      const templates = await listMealTemplates();
      setMealLibrary(templates);
    } catch (err) {
      setMealLibraryError(
        err instanceof Error ? err.message : "No se pudo cargar la biblioteca"
      );
    } finally {
      setMealLibraryLoading(false);
    }
  };

  const handleOpenClone = (meal: Meal) => {
    setCloneError(null);
    setCloneOpen(true);
    setCloneSourceId(null);
    setCloneTargetPlanId(plan?.id ?? null);
    setCloneTargetDate(selectedDate ?? null);
    setCloneTargetMealKey(meal.key);
    setCloneTargetMealName(meal.name);
    setCloneExpandedId(null);
  };

  const handleCloseClone = () => {
    setCloneOpen(false);
    setCloneSaving(false);
    setCloneError(null);
    setCloneSourceId(null);
    setCloneTargetPlanId(null);
    setCloneTargetDate(null);
    setCloneTargetMealKey(null);
    setCloneTargetMealName(null);
    setCloneExpandedId(null);
  };

  const handleConfirmClone = async () => {
    if (
      !cloneSourceId ||
      !cloneTargetPlanId ||
      !cloneTargetDate ||
      !cloneTargetMealKey
    ) {
      setCloneError("Completa los campos requeridos.");
      return;
    }
    const template = mealLibrary.find((item) => item.id === cloneSourceId);
    if (!template) {
      setCloneError("Selecciona un plato de la biblioteca.");
      return;
    }

    const baseMeals =
      cloneTargetDate === selectedDate
        ? currentMeals
        : getDayMeals(cloneTargetDate);
    const baseMealCount = getMealCount(baseMeals);
    if (!baseMealCount) {
      setCloneError("El dia seleccionado no tiene comidas configuradas.");
      return;
    }
    const targetMeals = mergeMealsWithTemplate(
      baseMeals,
      getMealsByCount(baseMealCount)
    );
    if (!targetMeals.some((meal) => meal.key === cloneTargetMealKey)) {
      setCloneError("Selecciona una comida destino valida.");
      return;
    }

    const nextMeals = targetMeals.map((meal) => {
      if (meal.key !== cloneTargetMealKey) return meal;
      return {
        ...meal,
        items: template.items.map((item) => ({
          ...item,
          macros: { ...item.macros },
        })),
        totals: { ...template.totals },
      };
    });

    const existingOverride =
      cloneTargetDate === selectedDate
        ? selectedOverride
        : overrides.find((item) => item.date === cloneTargetDate);
    const planAssessment = assessment ?? undefined;
    const baseOverride =
      existingOverride?.overrides ??
      (planAssessment?.inputs
        ? {
            dayType: planAssessment.inputs.dayType,
            activityLevel: planAssessment.inputs.activityLevel,
          }
        : {});

    setCloneSaving(true);
    setCloneError(null);
    try {
      const record = await upsertOverride({
        planId: cloneTargetPlanId,
        date: cloneTargetDate,
        overrides: baseOverride,
        meals: nextMeals,
      });

      if (cloneTargetPlanId === plan?.id) {
        setOverrides((prev) => {
          const filtered = prev.filter((item) => item.date !== record.date);
          return [...filtered, record];
        });
        setMealsByDate((prev) => ({
          ...prev,
          [record.date]: (record.meals ?? []) as Meal[],
        }));
      }

      setSnackbar("Plato clonado");
      handleCloseClone();
    } catch (err) {
      setCloneError("No se pudo clonar el plato.");
    } finally {
      setCloneSaving(false);
    }
  };

  const getDayData = (date: string) => {
    const override = overrides.find((item) => item.date === date);
    const outputs = computeOutputs(date, override);
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
    const kcalLabel = formatInt(kcal);

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
            {kcalLabel}
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
        </Stack>

        {!baseOutputs && (
          <Alert severity="warning">
            No hay outputs base cargados. Guarda una evaluacion y vuelve a abrir
            el plan.
          </Alert>
        )}

        {/* Week switcher */}
        <Stack spacing={1.5}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Stack direction="row" spacing={1} alignItems="center">
              <IconButton
                size="small"
                onClick={() => handleWeekChange(weekIndex - 1)}
                disabled={!canGoPrevWeek}
                aria-label="Semana anterior"
              >
                <ChevronLeftRoundedIcon />
              </IconButton>
              <Typography variant="subtitle2" fontWeight={700}>
                Semana {weekIndex + 1} de {weeks.length}
              </Typography>
              <IconButton
                size="small"
                onClick={() => handleWeekChange(weekIndex + 1)}
                disabled={!canGoNextWeek}
                aria-label="Semana siguiente"
              >
                <ChevronRightRoundedIcon />
              </IconButton>
            </Stack>
            {visibleDates.length > 0 && (
              <Typography variant="caption" color="text.secondary">
                {dayjs(visibleDates[0]).format("DD MMM")} -{" "}
                {dayjs(visibleDates[visibleDates.length - 1]).format("DD MMM")}
              </Typography>
            )}
          </Stack>
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
            {visibleDates.map((date) => {
            const day = dayjs(date);
            const { outputs, dayType, trainingCount } = getDayData(date);
            const isSelected = selectedDate === date;
            const isTraining = trainingCount > 0 || dayType === "training";
            const kcal = outputs?.kcalObjectiveDay;
            const kcalLabel = kcal !== undefined ? formatInt(kcal) : null;
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
                } ${kcalLabel ?? ""} kcal`}
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
                      0
                    )}, C ${remainingPortions.carbs.toFixed(
                      0
                    )}, G ${remainingPortions.fat.toFixed(0)}`}
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
                  {kcalLabel !== null && (
                    <Typography variant="caption" color="text.secondary">
                      {kcalLabel} kcal
                    </Typography>
                  )}
                </Stack>
              </ButtonBase>
            );
          })}
          </Stack>
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
                  EEE: {formatInt(selectedOutputs.eee)} kcal
                </Typography>
              </Box>
              <Chip
                label={selectedTrainingLabel}
                color={selectedDayType === "training" ? "primary" : "default"}
                variant={selectedDayType === "training" ? "outlined" : "filled"}
                onClick={handleEditSelectedDay}
                clickable
                aria-label="Editar dia"
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
                      onClick={handleEditSelectedDay}
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
                        {`Consumidas: ${currentTotals.kcal.toFixed(
                          0
                        )} / ${formatInt(
                          selectedOutputs.kcalObjectiveDay
                        )} kcal`}
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
                          const tol = getTol(budget, key);
                          const remaining =
                            Math.abs(remainingRaw) <= tol ? 0 : remainingRaw;
                          const percent =
                            budget > 0
                              ? Math.min((used / budget) * 100, 140)
                              : 0;
                          const state = getMacroState(
                            remainingRaw,
                            budget,
                            key
                          );
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
                          const isExcess = state === "over";
                          const isPending = state === "pending";
                          const isCompleted = state === "ok";
                          const statusText = isExcess
                            ? `Exceso ${formatInt(Math.abs(remaining))}`
                            : isPending
                            ? `Restan ${formatInt(remaining)}`
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
                                {`${label} Obj: ${objective.toFixed(
                                  0
                                )} g | ${formatInt(budget)} porciones`}
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
                                  color={
                                    isExcess ? "error.main" : "text.primary"
                                  }
                                >
                                  {statusText}
                                </Typography>
                                <Chip
                                  size="small"
                                  color={isExcess ? "error" : "default"}
                                  label={`de ${formatInt(budget)} porciones`}
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
                                <Typography
                                  variant="caption"
                                  color="error.main"
                                >
                                  Te pasaste en {formatInt(Math.abs(remaining))}{" "}
                                  porciones
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
                                Objetivo: {objective.toFixed(0)} g · Usado:{" "}
                                {used.toFixed(0)} g · Restan:{" "}
                                {remaining.toFixed(0)} g
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
                    onClick={() => handleSaveMeals()}
                    disabled={!mealCount}
                  >
                    Guardar comidas
                  </Button>
                </Stack>
                <Stack spacing={1}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    Cuantas comidas haras hoy?
                  </Typography>
                  <ToggleButtonGroup
                    value={mealCount}
                    exclusive
                    onChange={(_, value) => {
                      if (!value) return;
                      handleMealCountChange(value);
                    }}
                    size="small"
                    sx={{ width: "100%", justifyContent: "center" }}
                  >
                    <ToggleButton value={3} sx={{ flex: 1 }}>
                      3
                    </ToggleButton>
                    <ToggleButton value={4} sx={{ flex: 1 }}>
                      4
                    </ToggleButton>
                    <ToggleButton value={5} sx={{ flex: 1 }}>
                      5
                    </ToggleButton>
                  </ToggleButtonGroup>
                  <Typography variant="caption" color="text.secondary">
                    Selecciona 3, 4 o 5 comidas para distribuir las macros del
                    dia.
                  </Typography>
                </Stack>
                {!mealCount ? (
                  <Typography variant="caption" color="text.secondary">
                    Elige el numero de comidas para comenzar.
                  </Typography>
                ) : (
                  <MealBuilder
                    meals={currentMeals}
                    onChange={handleMealsChange}
                    onSave={handleSaveMeals}
                    mealTargets={mealTargets}
                    onError={(msg) => setSnackbar(msg)}
                    onCloneMeal={handleOpenClone}
                  />
                )}
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

      <Dialog
        open={cloneOpen}
        onClose={handleCloseClone}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Clonar plato</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Stack spacing={1}>
              <Typography variant="subtitle2" fontWeight={700}>
                Platos guardados
              </Typography>
              {mealLibraryLoading ? (
                <Typography variant="caption" color="text.secondary">
                  Cargando biblioteca...
                </Typography>
              ) : mealLibrary.length === 0 ? (
                <Typography variant="caption" color="text.secondary">
                  No hay platos guardados en la biblioteca.
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {mealLibrary.map((item) => {
                    const isSelected = cloneSourceId === item.id;
                    const isExpanded = cloneExpandedId === item.id;
                    return (
                      <Accordion
                        key={item.id}
                        expanded={isExpanded}
                        onChange={(_, expanded) =>
                          setCloneExpandedId(expanded ? item.id : null)
                        }
                        disableGutters
                        elevation={0}
                        sx={{
                          borderRadius: 2,
                          border: "1px solid",
                          borderColor: isSelected ? "primary.main" : "divider",
                          "&:before": { display: "none" },
                        }}
                      >
                        <AccordionSummary
                          expandIcon={<ExpandMoreIcon />}
                          sx={{
                            px: 1.5,
                            py: 1,
                            "& .MuiAccordionSummary-content": {
                              my: 0,
                            },
                          }}
                        >
                          <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={1}
                            alignItems={{ xs: "flex-start", sm: "center" }}
                            justifyContent="space-between"
                            width="100%"
                          >
                            <Stack spacing={0.25} alignItems="flex-start">
                              <Typography variant="body2" fontWeight={700}>
                                {item.name}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                {item.items.length} items |{" "}
                                {item.totals.kcal.toFixed(0)} kcal
                              </Typography>
                            </Stack>
                            <Stack
                              direction="row"
                              spacing={1}
                              alignItems="center"
                            >
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                Ver ingredientes
                              </Typography>
                              <Button
                                size="small"
                                variant={isSelected ? "contained" : "outlined"}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  event.preventDefault();
                                  setCloneSourceId(item.id);
                                }}
                              >
                                {isSelected ? "Seleccionado" : "Seleccionar"}
                              </Button>
                            </Stack>
                          </Stack>
                        </AccordionSummary>
                        <AccordionDetails sx={{ pt: 0, pb: 1.5, px: 1.5 }}>
                          <Stack spacing={1}>
                            {item.items.length ? (
                              item.items.map((mealItem, idx) => (
                                <Box
                                  key={`${mealItem.foodId}-${idx}-clone`}
                                  sx={{
                                    p: 1,
                                    borderRadius: 2,
                                    border: "1px solid",
                                    borderColor: "divider",
                                  }}
                                >
                                  <Typography variant="body2" fontWeight={700}>
                                    {mealItem.nameSnapshot}
                                  </Typography>
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                  >
                                    {mealItem.grams.toFixed(0)} g |{" "}
                                    {mealItem.kcal.toFixed(0)} kcal | P{" "}
                                    {mealItem.macros.protein.toFixed(0)} C{" "}
                                    {mealItem.macros.carbs.toFixed(0)} G{" "}
                                    {mealItem.macros.fat.toFixed(0)}
                                  </Typography>
                                </Box>
                              ))
                            ) : (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                Sin alimentos.
                              </Typography>
                            )}
                          </Stack>
                        </AccordionDetails>
                      </Accordion>
                    );
                  })}
                </Stack>
              )}
              {mealLibraryError && (
                <Typography variant="caption" color="error">
                  {mealLibraryError}
                </Typography>
              )}
            </Stack>

            {cloneSource && (
              <Typography variant="caption" color="text.secondary">
                Se clonara en {cloneTargetMealName ?? "la comida seleccionada"}{" "}
                {cloneTargetDate
                  ? `| ${dayjs(cloneTargetDate).format("DD MMM YYYY")}`
                  : ""}
                .
              </Typography>
            )}
            {cloneError && (
              <Typography variant="caption" color="error">
                {cloneError}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseClone}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={handleConfirmClone}
            disabled={cloneDisabled}
          >
            {cloneSaving ? "Clonando..." : "Clonar"}
          </Button>
        </DialogActions>
      </Dialog>

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
