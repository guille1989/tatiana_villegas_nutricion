import {
  Alert,
  Box,
  Button,
  ButtonBase,
  IconButton,
  Collapse,
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
  InputAdornment,
  MenuItem,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from "@mui/material";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import SearchIcon from "@mui/icons-material/Search";
import dayjs from "dayjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@mui/material/styles";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import DayEditDialog from "../components/DayEditDialog";
import {
  applyMacroOverrideToOutputs,
  calculateDayFromBase,
  getMacroKcalBreakdown,
  toMacroPortionValue,
  toMacroPortions,
} from "../lib/calc";
import {
  createAdminUserMealTemplate,
  createMealTemplate,
  getPlan,
  listAdminUserMealTemplates,
  listMealTemplates,
  upsertOverride,
} from "../lib/api";
import MealBuilder from "../components/MealBuilder";
import {
  getMacroState,
  getTol,
  macroStateColor,
  type MacroKey,
} from "../lib/macroStatus";
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
  MealItem,
  MealTemplate,
  Plan,
  PlanMacroOverride,
  WizardInputs,
} from "../types";

const CLONE_PAGE_SIZE = 6;
const TEMPLATE_DATE_REGEX = /\d{4}-\d{2}-\d{2}/;
const MEAL_TYPE_OPTIONS = [
  "Desayuno",
  "Comida",
  "Cena",
  "Merienda",
  "Merienda 1",
  "Merienda 2",
];

const getTemplateMealName = (name: string) => {
  const [mealName] = name.split(" - ");
  return (mealName ?? "").trim();
};

const getTemplateDateKey = (template: MealTemplate) => {
  const match = template.name.match(TEMPLATE_DATE_REGEX);
  if (match) return match[0];
  return dayjs(template.createdAt).format("YYYY-MM-DD");
};

const getTemplateDisplayName = (template: MealTemplate) => {
  const base = getTemplateMealName(template.name);
  return base || `Plato #${template.id}`;
};

const matchesMealType = (template: MealTemplate, mealType: string | null) => {
  if (!mealType) return true;
  const templateType = getTemplateMealName(template.name).toLowerCase();
  const selected = mealType.toLowerCase();
  if (selected === "merienda") return templateType.startsWith("merienda");
  return templateType === selected;
};

const matchesTemplateSearch = (template: MealTemplate, query: string) => {
  if (!query.trim()) return true;
  const lowered = query.toLowerCase();
  if (getTemplateDisplayName(template).toLowerCase().includes(lowered)) {
    return true;
  }
  return template.items.some((item) =>
    item.nameSnapshot.toLowerCase().includes(lowered)
  );
};

const PlanDetailPage = () => {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const { isAdmin } = useAuth();
  const detailRef = useRef<HTMLDivElement | null>(null);
  const initialSelectionDoneRef = useRef(false);
  const cloneLibraryRequestedRef = useRef(false);
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
  const [cloneShowAllId, setCloneShowAllId] = useState<string | null>(null);
  const [cloneMealType, setCloneMealType] = useState<string | null>(null);
  const [cloneMealTypeLocked, setCloneMealTypeLocked] = useState(true);
  const [cloneSearch, setCloneSearch] = useState("");
  const [cloneVisibleCount, setCloneVisibleCount] = useState(CLONE_PAGE_SIZE);

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
      .catch((err) => {
        const message =
          err instanceof Error ? err.message : "No se pudo cargar el plan";
        if (message.toLowerCase().includes("no encontrado") || message.includes("404")) {
          navigate("/plans", { replace: true });
          return;
        }
        setError(message);
      });
  }, [planId, navigate]);

  useEffect(() => {
    initialSelectionDoneRef.current = false;
  }, [planId]);

  useEffect(() => {
    setMealLibrary([]);
    setMealLibraryError(null);
    cloneLibraryRequestedRef.current = false;
  }, [planId]);

  useEffect(() => {
    if (!plan || isAdmin) return;
    const isActive = plan.status === "active" || !plan.status;
    if (!isActive) {
      navigate("/plans", { replace: true });
    }
  }, [plan, isAdmin, navigate]);

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
    const todayLabel = dayjs().startOf("day").format("YYYY-MM-DD");
    const defaultDate = dates.includes(todayLabel) ? todayLabel : dates[0];
    if (!initialSelectionDoneRef.current) {
      setSelectedDate(defaultDate);
      initialSelectionDoneRef.current = true;
      return;
    }
    if (!selectedDate || !dates.includes(selectedDate)) {
      setSelectedDate(defaultDate);
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
    if (!cloneOpen) {
      cloneLibraryRequestedRef.current = false;
      return;
    }
    if (cloneLibraryRequestedRef.current) return;
    cloneLibraryRequestedRef.current = true;
    if (mealLibrary.length === 0) {
      void loadMealLibrary();
    }
  }, [cloneOpen, mealLibrary.length]);

  useEffect(() => {
    if (!cloneOpen) return;
    setCloneVisibleCount(CLONE_PAGE_SIZE);
    setCloneExpandedId(null);
    setCloneShowAllId(null);
  }, [cloneOpen, cloneMealType, cloneSearch]);

  useEffect(() => {
    if (!cloneOpen) return;
    setCloneSourceId(null);
  }, [cloneMealType, cloneOpen]);

  const baseOutputs = assessment?.outputs;
  const baseInputs = assessment?.inputs;

  const getTrainingType = (override?: DayOverride | null) => {
    const overrideTraining =
      override?.overrides?.trainings?.find((item) => item?.type)?.type ??
      override?.overrides?.training?.type ??
      null;
    return (overrideTraining ?? baseInputs?.trainingType ?? null) as
      | WizardInputs["trainingType"]
      | null;
  };

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

  const applyMacroOverride = (
    outputs: CalculationOutputs | undefined,
    date: string | null,
    dayType: "training" | "rest",
    trainingType: WizardInputs["trainingType"] | null,
    activityDelta = 0,
    dayOverride?: DayOverride
  ) => {
    if (!outputs) return outputs;
    const dailyOverride = dayOverride?.overrides?.macroOverride ?? null;
    const planOverride = getMacroOverrideForDate(date, plan?.macroOverrides);
    const overrideMacros = dailyOverride ?? planOverride?.macros ?? null;
    if (!overrideMacros) return outputs;
    if (!baseInputs?.goal) return outputs;
    return applyMacroOverrideToOutputs({
      outputs,
      overrideMacros,
      dayType,
      trainingType,
      goal: baseInputs.goal,
      weight: baseInputs.weight ?? 0,
      activityDelta,
    });
  };

  const computeOutputs = (date: string | null, override?: DayOverride) => {
    const dayType =
      override?.overrides.dayType ?? baseInputs?.dayType ?? "rest";
    const trainingType = getTrainingType(override);
    let activityDelta = 0;
    if (
      baseInputs &&
      override?.overrides?.activityLevel !== undefined &&
      override?.overrides?.activityLevel !== null
    ) {
      try {
        const baseOverrides = { ...override.overrides, activityLevel: undefined };
        const baseOutputs = calculateDayFromBase(baseInputs, baseOverrides);
        const activityOutputs = calculateDayFromBase(
          baseInputs,
          override.overrides
        );
        activityDelta =
          (activityOutputs.kcalObjectiveDay ?? 0) -
          (baseOutputs.kcalObjectiveDay ?? 0);
      } catch {
        activityDelta = 0;
      }
    }
    if (!baseInputs)
      return applyMacroOverride(
        baseOutputs ?? undefined,
        date,
        dayType,
        trainingType,
        activityDelta,
        override
      );
    if (override?.computed)
      return applyMacroOverride(
        override.computed,
        date,
        dayType,
        trainingType,
        activityDelta,
        override
      );
    if (override) {
      try {
        return applyMacroOverride(
          calculateDayFromBase(baseInputs, override.overrides),
          date,
          dayType,
          trainingType,
          activityDelta,
          override
        );
      } catch {
        return applyMacroOverride(
          baseOutputs ?? undefined,
          date,
          dayType,
          trainingType,
          0,
          override
        );
        }
      }
      return applyMacroOverride(
        baseOutputs ?? undefined,
        date,
        dayType,
        trainingType
      );
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

  const MACRO_GROUP_MAP: Record<NonNullable<MealItem["group"]>, MacroKey> = {
    proteinas: "protein",
    carbohidratos: "carbs",
    grasas: "fat",
    vegetales: "carbs",
    extras: "carbs",
  };

  type MacroSources = {
    direct: number;
    indirect: number;
    total: number;
  };

  type MacroSourceSummary = Record<MacroKey, MacroSources> & { kcal: number };

  const buildMacroSources = (): MacroSources => ({
    direct: 0,
    indirect: 0,
    total: 0,
  });

  const calcMacroSources = (meals: Meal[]): MacroSourceSummary => {
    const summary: MacroSourceSummary = {
      protein: buildMacroSources(),
      carbs: buildMacroSources(),
      fat: buildMacroSources(),
      kcal: 0,
    };

    meals.forEach((meal) => {
      summary.kcal += meal.totals.kcal;
      meal.items.forEach((item) => {
        const groupKey = item.group ? MACRO_GROUP_MAP[item.group] : null;
        (["protein", "carbs", "fat"] as const).forEach((key) => {
          const value = item.macros[key];
          if (!groupKey || groupKey === key) {
            // Treat legacy items without group as direct to avoid mislabeling.
            summary[key].direct += value;
          } else {
            summary[key].indirect += value;
          }
        });
      });
    });

    (["protein", "carbs", "fat"] as const).forEach((key) => {
      summary[key].total = summary[key].direct + summary[key].indirect;
    });

    return summary;
  };

  const formatInt = (value: number) => Math.round(value);
  const formatPortions = (value: number) => (Math.round(value * 10) / 10).toFixed(1);

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
  const currentMacroSources = calcMacroSources(currentMeals);
  const macroLabels: Record<MacroKey, string> = {
    protein: "Proteina",
    carbs: "Carbohidratos",
    fat: "Grasas",
  };
  const macroPlural: Record<MacroKey, string> = {
    protein: "proteinas",
    carbs: "carbohidratos",
    fat: "grasas",
  };
  const macroIndirect: Record<MacroKey, string> = {
    protein: "indirectas",
    carbs: "indirectos",
    fat: "indirectas",
  };
  const macroColors: Record<MacroKey, string> = {
    protein: theme.palette.primary.main,
    carbs: theme.palette.success.main,
    fat: theme.palette.warning.main,
  };
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
  const cloneMealTypeLabel = cloneMealType ?? cloneTargetMealName ?? "";
  const cloneSortedTemplates = useMemo(() => {
    const filteredByType = mealLibrary.filter((item) =>
      matchesMealType(item, cloneMealType)
    );
    const filteredBySearch = cloneSearch.trim()
      ? filteredByType.filter((item) =>
          matchesTemplateSearch(item, cloneSearch)
        )
      : filteredByType;
    return filteredBySearch
      .slice()
      .sort((a, b) => {
        const dateDiff = dayjs(getTemplateDateKey(b)).diff(
          dayjs(getTemplateDateKey(a))
        );
        if (dateDiff !== 0) return dateDiff;
        return dayjs(b.createdAt).diff(dayjs(a.createdAt));
      });
  }, [cloneMealType, cloneSearch, mealLibrary]);
  const cloneVisibleTemplates = cloneSortedTemplates.slice(0, cloneVisibleCount);
  const cloneHasMore = cloneSortedTemplates.length > cloneVisibleCount;
  const cloneGroupedTemplates = useMemo(() => {
    const groups = new Map<string, MealTemplate[]>();
    cloneVisibleTemplates.forEach((item) => {
      const dateKey = getTemplateDateKey(item);
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)?.push(item);
    });
    return Array.from(groups.entries()).map(([dateKey, items]) => ({
      dateKey,
      items,
    }));
  }, [cloneVisibleTemplates]);
  const cloneEmpty =
    !mealLibraryLoading && cloneSortedTemplates.length === 0;

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
    if (isAdmin && !plan?.userId) return;
    const candidates = meals.filter((meal) => meal.items.length > 0);
    if (candidates.length === 0) return;
    let templates = mealLibrary;
    if (templates.length === 0) {
      try {
        templates = isAdmin && plan?.userId
          ? await listAdminUserMealTemplates(plan.userId)
          : await listMealTemplates();
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
          (isAdmin && plan?.userId
            ? createAdminUserMealTemplate(plan.userId, {
                name: buildMealTemplateName(meal.name, dateLabel, usedNames),
                items: meal.items,
                totals: meal.totals,
              })
            : createMealTemplate({
                name: buildMealTemplateName(meal.name, dateLabel, usedNames),
                items: meal.items,
                totals: meal.totals,
              }))
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
    if (isAdmin && !plan?.userId) return;
    setMealLibraryLoading(true);
    setMealLibraryError(null);
    try {
      const templates =
        isAdmin && plan?.userId
          ? await listAdminUserMealTemplates(plan.userId)
          : await listMealTemplates();
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
    setCloneMealType(meal.name);
    setCloneMealTypeLocked(true);
    setCloneSearch("");
    setCloneVisibleCount(CLONE_PAGE_SIZE);
    setCloneTargetPlanId(plan?.id ?? null);
    setCloneTargetDate(selectedDate ?? null);
    setCloneTargetMealKey(meal.key);
    setCloneTargetMealName(meal.name);
    setCloneExpandedId(null);
    setCloneShowAllId(null);
  };

  const handleCloseClone = () => {
    setCloneOpen(false);
    setCloneSaving(false);
    setCloneError(null);
    setCloneSourceId(null);
    setCloneMealType(null);
    setCloneMealTypeLocked(true);
    setCloneSearch("");
    setCloneVisibleCount(CLONE_PAGE_SIZE);
    setCloneTargetPlanId(null);
    setCloneTargetDate(null);
    setCloneTargetMealKey(null);
    setCloneTargetMealName(null);
    setCloneExpandedId(null);
    setCloneShowAllId(null);
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
  const cloneTargetDayData =
    cloneTargetDate && cloneTargetPlanId === plan?.id ? getDayData(cloneTargetDate) : null;
  const cloneTargetBaseMeals =
    cloneTargetDate && cloneTargetPlanId === plan?.id ? getDayMeals(cloneTargetDate) : [];
  const cloneTargetMealCount = getMealCount(cloneTargetBaseMeals);
  const cloneTargetMealMacros =
    cloneTargetMealKey &&
    cloneTargetDayData?.outputs &&
    cloneTargetMealCount
      ? distributeMacros(
          {
            protein: cloneTargetDayData.outputs.protein,
            carbs: cloneTargetDayData.outputs.carbsAdjusted,
            fat: cloneTargetDayData.outputs.fatsAdjusted,
          },
          getWeightsByCount(cloneTargetMealCount)
        )[cloneTargetMealKey]
      : null;
  const cloneTargetSummary =
    cloneTargetMealMacros &&
    (cloneTargetMealMacros.protein > 0 ||
      cloneTargetMealMacros.carbs > 0 ||
      cloneTargetMealMacros.fat > 0)
      ? {
          protein: Math.round(cloneTargetMealMacros.protein),
          carbs: Math.round(cloneTargetMealMacros.carbs),
          fat: Math.round(cloneTargetMealMacros.fat),
          kcal: Math.round(
            cloneTargetMealMacros.protein * 4 +
              cloneTargetMealMacros.carbs * 4 +
              cloneTargetMealMacros.fat * 9
          ),
        }
      : null;
  const cloneTargetPortions =
    cloneTargetSummary
      ? toMacroPortions({
          protein: cloneTargetSummary.protein,
          carbs: cloneTargetSummary.carbs,
          fat: cloneTargetSummary.fat,
        })
      : null;

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

    const { proteinKcal, carbsKcal, fatKcal, totalKcal } = getMacroKcalBreakdown(
      {
        protein,
        carbs,
        fat: fats,
      }
    );
    const total = totalKcal;

    const getDash = (val: number) =>
      total > 0 ? (val / total) * circumference : 0;

    const segments = [
      { val: proteinKcal, color: theme.palette.primary.main },
      { val: carbsKcal, color: theme.palette.success.main },
      { val: fatKcal, color: theme.palette.warning.main },
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
              {plan.title ?? `Plan ${plan.days} dias`}
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
            const dayMacroSources = calcMacroSources(dayMeals);
            const budgetPortions = outputs
              ? toMacroPortions({
                  protein: outputs.protein,
                  carbs: outputs.carbsAdjusted,
                  fat: outputs.fatsAdjusted,
                })
              : { protein: 0, carbs: 0, fat: 0 };
            const usedPortions = toMacroPortions({
              protein: dayMacroSources.protein.direct,
              carbs: dayMacroSources.carbs.total,
              fat: dayMacroSources.fat.total,
            });
            const remainingRawPortions = outputs
              ? {
                  protein: budgetPortions.protein - usedPortions.protein,
                  carbs: budgetPortions.carbs - usedPortions.carbs,
                  fat: budgetPortions.fat - usedPortions.fat,
                }
              : { protein: 0, carbs: 0, fat: 0 };
            const remainingPortions = outputs
              ? {
                  protein:
                    Math.abs(remainingRawPortions.protein) <=
                    getTol(budgetPortions.protein, "protein")
                      ? 0
                      : remainingRawPortions.protein,
                  carbs:
                    Math.abs(remainingRawPortions.carbs) <=
                    getTol(budgetPortions.carbs, "carbs")
                      ? 0
                      : remainingRawPortions.carbs,
                  fat:
                    Math.abs(remainingRawPortions.fat) <=
                    getTol(budgetPortions.fat, "fat")
                      ? 0
                      : remainingRawPortions.fat,
                }
              : { protein: 0, carbs: 0, fat: 0 };
            const status = getDayStatus(remainingRawPortions, budgetPortions);
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
                  EEE: {formatInt(selectedOutputs.eee)} kcal | PAL:{" "}
                  {selectedOutputs.pal !== undefined
                    ? selectedOutputs.pal.toFixed(2)
                    : "--"}
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
                          const macroSource = currentMacroSources[key];
                          const directGrams = macroSource.direct;
                          const indirectGrams = macroSource.indirect;
                          const totalGrams = macroSource.total;
                          const usedGrams =
                            key === "protein" ? directGrams : totalGrams;
                          const budget =
                            key === "protein"
                              ? toMacroPortionValue(
                                  selectedOutputs.protein,
                                  "protein"
                                )
                              : key === "carbs"
                              ? toMacroPortionValue(
                                  selectedOutputs.carbsAdjusted,
                                  "carbs"
                                )
                              : toMacroPortionValue(
                                  selectedOutputs.fatsAdjusted,
                                  "fat"
                                );
                          const usedPortions =
                            key === "protein"
                              ? toMacroPortionValue(usedGrams, "protein")
                              : key === "carbs"
                              ? toMacroPortionValue(usedGrams, "carbs")
                              : toMacroPortionValue(usedGrams, "fat");
                          const remainingRaw = budget - usedPortions;
                          const tol = getTol(budget, key);
                          const remaining =
                            Math.abs(remainingRaw) <= tol ? 0 : remainingRaw;
                          const percent =
                            budget > 0
                              ? Math.min((usedPortions / budget) * 100, 140)
                              : 0;
                          const state = getMacroState(
                            remainingRaw,
                            budget,
                            key
                          );
                          const label = macroLabels[key];
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
                          const indirectLimit =
                            key === "protein" ? objective * 0.15 : objective;
                          const indirectRatio =
                            indirectLimit > 0
                              ? Math.min(indirectGrams / indirectLimit, 1)
                              : 0;
                          const macroColor = macroColors[key];
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
                                {`${label}: ${formatInt(
                                  totalGrams
                                )} / ${objective.toFixed(0)} g | ${formatInt(
                                  budget
                                )} porciones`}
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
                              <Stack spacing={0.5} sx={{ mt: 1 }} display="none">
                                <Stack
                                  direction="row"
                                  alignItems="center"
                                  justifyContent="space-between"
                                >
                                  <Stack
                                    direction="row"
                                    alignItems="center"
                                    spacing={0.5}
                                  >
                                    <Typography
                                      variant="caption"
                                      color="text.secondary"
                                      fontWeight={600}
                                    >
                                      Origen (informativo)
                                    </Typography>
                                    <Tooltip
                                      title="Los macros indirectos corresponden a aportes secundarios de alimentos que no pertenecen a esta categoria principal. Forman parte del total diario."
                                      arrow
                                    >
                                      <InfoOutlinedIcon
                                        sx={{
                                          fontSize: 14,
                                          color: "text.secondary",
                                        }}
                                      />
                                    </Tooltip>
                                  </Stack>
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                  >
                                    Directo {formatInt(directGrams)} g | Indirecto{" "}
                                    {formatInt(indirectGrams)} g
                                  </Typography>
                                </Stack>
                                <Box
                                  sx={{
                                    height: 6,
                                    borderRadius: 999,
                                    overflow: "hidden",
                                    display: "flex",
                                    bgcolor: "grey.200",
                                  }}
                                >
                                  <Box
                                    sx={{
                                      width: `${indirectRatio * 100}%`,
                                      bgcolor: macroColor,
                                      opacity: 0.50,
                                    }}
                                  />
                                </Box>
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  Incluye {formatInt(indirectGrams)} g de{" "}
                                  {macroPlural[key]} {macroIndirect[key]} provenientes
                                  de otros alimentos.
                                </Typography>
                              </Stack>
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
        <DialogTitle sx={{ pb: 1 }}>
          <Stack spacing={0.75}>
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              flexWrap="wrap"
            >
              <Typography variant="h6" fontWeight={700}>
                Clonar plato
              </Typography>
              {cloneMealTypeLabel && (
                <Chip size="small" label={cloneMealTypeLabel} />
              )}
            </Stack>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              alignItems={{ xs: "flex-start", sm: "center" }}
            >
              <Typography variant="body2" color="text.secondary">
                {cloneMealTypeLabel
                  ? `Elige un plato de ${cloneMealTypeLabel} para clonar`
                  : "Elige un plato para clonar"}
              </Typography>
              {cloneMealTypeLocked && cloneMealTypeLabel && (
                <Button
                  size="small"
                  variant="text"
                  onClick={() => setCloneMealTypeLocked(false)}
                >
                  Cambiar tipo
                </Button>
              )}
            </Stack>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            {!cloneMealTypeLocked && (
              <TextField
                select
                size="small"
                label="Tipo de comida"
                value={cloneMealType ?? ""}
                onChange={(event) =>
                  setCloneMealType(event.target.value || null)
                }
                fullWidth
              >
                {MEAL_TYPE_OPTIONS.map((option) => (
                  <MenuItem key={option} value={option}>
                    {option}
                  </MenuItem>
                ))}
              </TextField>
            )}

            <TextField
              size="small"
              placeholder="Buscar por nombre o ingrediente..."
              value={cloneSearch}
              onChange={(event) => setCloneSearch(event.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
              fullWidth
            />
            {cloneTargetSummary && (
              <Stack spacing={0.25} sx={{ px: 0.25 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    lineHeight: 1.4,
                  }}
                >
                  Objetivo: {cloneTargetSummary.kcal} kcal · P{cloneTargetSummary.protein} · C
                  {cloneTargetSummary.carbs} · G{cloneTargetSummary.fat}
                </Typography>
                {cloneTargetPortions && (
                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.35 }}>
                    Porciones: P {formatPortions(cloneTargetPortions.protein)} · C{" "}
                    {formatPortions(cloneTargetPortions.carbs)} · G{" "}
                    {formatPortions(cloneTargetPortions.fat)}
                  </Typography>
                )}
              </Stack>
            )}

            {mealLibraryLoading ? (
              <Typography variant="caption" color="text.secondary">
                Cargando biblioteca...
              </Typography>
            ) : cloneEmpty ? (
              <Stack spacing={1} sx={{ p: 1.5, borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
                <Typography variant="subtitle2" fontWeight={700}>
                  Aun no tienes platos guardados para {cloneMealTypeLabel || "este tipo"}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Guarda un plato para reutilizarlo rapidamente.
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="outlined" onClick={handleCloseClone}>
                    Volver
                  </Button>
                  <Button size="small" variant="contained" onClick={handleCloseClone}>
                    Crear un plato
                  </Button>
                </Stack>
              </Stack>
            ) : (
              <Stack spacing={2}>
                {cloneGroupedTemplates.map((group) => (
                  <Stack key={group.dateKey} spacing={1}>
                    <Typography variant="caption" color="text.secondary" fontWeight={700}>
                      {dayjs(group.dateKey).format("ddd, DD MMM YYYY")}
                    </Typography>
                    <Stack spacing={1}>
                      {group.items.map((item) => {
                        const isSelected = cloneSourceId === item.id;
                        const isExpanded = cloneExpandedId === item.id;
                        const showAll = cloneShowAllId === item.id;
                        const visibleItems = showAll ? item.items : item.items.slice(0, 4);
                        const hasMoreItems = item.items.length > 4;
                        const displayName = getTemplateDisplayName(item);
                        const mealNameLabel = getTemplateMealName(item.name) || displayName;
                        const ingredientNames = item.items
                          .map((mealItem) => mealItem.nameSnapshot?.trim() ?? "")
                          .filter((name) => name.length > 0);
                        const previewIngredients = ingredientNames.slice(0, 4);
                        const hiddenIngredientsCount = Math.max(
                          ingredientNames.length - previewIngredients.length,
                          0
                        );
                        const ingredientPreviewLabel = previewIngredients.length
                          ? `${previewIngredients.join(" · ")}${
                              hiddenIngredientsCount ? ` · +${hiddenIngredientsCount}` : ""
                            }`
                          : "Sin ingredientes";
                        // Prefer persisted template totals. If a legacy template misses totals,
                        // sum ingredient macros inline to avoid changing models or API payloads.
                        const fallbackTotals = item.items.reduce(
                          (acc, mealItem) => ({
                            protein: acc.protein + (mealItem.macros?.protein ?? 0),
                            carbs: acc.carbs + (mealItem.macros?.carbs ?? 0),
                            fat: acc.fat + (mealItem.macros?.fat ?? 0),
                            kcal: acc.kcal + (mealItem.kcal ?? 0),
                          }),
                          { protein: 0, carbs: 0, fat: 0, kcal: 0 }
                        );
                        const templateTotals = {
                          protein: item.totals?.protein ?? fallbackTotals.protein,
                          carbs: item.totals?.carbs ?? fallbackTotals.carbs,
                          fat: item.totals?.fat ?? fallbackTotals.fat,
                          kcal: item.totals?.kcal ?? fallbackTotals.kcal,
                        };
                        const templatePortions = toMacroPortions({
                          protein: templateTotals.protein,
                          carbs: templateTotals.carbs,
                          fat: templateTotals.fat,
                        });
                        const templateLabel = `${mealNameLabel} · ${item.items.length} items`;
                        return (
                          <Box
                            key={item.id}
                            sx={{
                              p: 1.5,
                              borderRadius: 2,
                              border: "1px solid",
                              borderColor: isSelected ? "primary.main" : "divider",
                              bgcolor: isSelected ? "primary.main" + "0D" : "transparent",
                            }}
                          >
                            <Stack spacing={1.25}>
                              <Stack
                                direction={{ xs: "column", sm: "row" }}
                                spacing={1}
                                alignItems={{ xs: "flex-start", sm: "flex-start" }}
                                justifyContent="space-between"
                              >
                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                  <Typography
                                    variant="body2"
                                    fontWeight={700}
                                    sx={{ lineHeight: 1.35, wordBreak: "break-word" }}
                                  >
                                    {templateLabel}
                                  </Typography>
                                </Box>
                                <Typography
                                  variant="subtitle2"
                                  fontWeight={800}
                                  sx={{ whiteSpace: "nowrap", lineHeight: 1.2 }}
                                >
                                  {Math.round(templateTotals.kcal)} kcal
                                </Typography>
                              </Stack>

                              <Stack
                                direction={{ xs: "column", sm: "row" }}
                                spacing={1}
                                alignItems={{ xs: "stretch", sm: "center" }}
                                justifyContent="space-between"
                              >
                                <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
                                  <Stack
                                    direction="row"
                                    spacing={0.75}
                                    useFlexGap
                                    flexWrap="wrap"
                                    alignItems="center"
                                  >
                                    <Chip
                                      size="small"
                                      label={`P ${Math.round(templateTotals.protein)}`}
                                      sx={{
                                        fontWeight: 700,
                                        bgcolor: "primary.main",
                                        color: "primary.contrastText",
                                        height: 26,
                                      }}
                                    />
                                    <Chip
                                      size="small"
                                      label={`C ${Math.round(templateTotals.carbs)}`}
                                      variant="outlined"
                                      sx={{ height: 26 }}
                                    />
                                    <Chip
                                      size="small"
                                      label={`G ${Math.round(templateTotals.fat)}`}
                                      variant="outlined"
                                      sx={{ height: 26 }}
                                    />
                                  </Stack>
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ lineHeight: 1.35, wordBreak: "break-word" }}
                                  >
                                    Porciones: P {formatPortions(templatePortions.protein)} · C{" "}
                                    {formatPortions(templatePortions.carbs)} · G{" "}
                                    {formatPortions(templatePortions.fat)}
                                  </Typography>
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ lineHeight: 1.35, wordBreak: "break-word" }}
                                  >
                                    Ingredientes: {ingredientPreviewLabel}
                                  </Typography>
                                </Stack>
                                <Stack
                                  direction="row"
                                  spacing={1}
                                  alignItems="center"
                                  justifyContent={{ xs: "space-between", sm: "flex-end" }}
                                  sx={{ width: { xs: "100%", sm: "auto" } }}
                                >
                                  <Button
                                    size="small"
                                    variant="text"
                                    onClick={() => {
                                      setCloneExpandedId(isExpanded ? null : item.id);
                                      if (isExpanded) {
                                        setCloneShowAllId(null);
                                      }
                                    }}
                                    sx={{ minHeight: 44, px: 1 }}
                                  >
                                    {isExpanded ? "Ocultar ingredientes" : "Ver ingredientes"}
                                  </Button>
                                  <Button
                                    size="small"
                                    variant={isSelected ? "contained" : "outlined"}
                                    onClick={() => setCloneSourceId(item.id)}
                                    sx={{ minHeight: 44, minWidth: 108 }}
                                  >
                                    {isSelected ? "Seleccionado" : "Seleccionar"}
                                  </Button>
                                </Stack>
                              </Stack>

                              <Collapse in={isExpanded}>
                                <Stack spacing={1}>
                                  {visibleItems.length ? (
                                    <Box
                                      sx={{
                                        borderRadius: 2,
                                        border: "1px solid",
                                        borderColor: "divider",
                                        overflow: "hidden",
                                      }}
                                    >
                                      {visibleItems.map((mealItem, idx) => (
                                        <Stack
                                          key={`${item.id}-${mealItem.foodId}-${idx}`}
                                          direction="row"
                                          spacing={1}
                                          alignItems="center"
                                          justifyContent="space-between"
                                          sx={{
                                            px: 1,
                                            py: 0.75,
                                            minHeight: 38,
                                            borderBottom:
                                              idx < visibleItems.length - 1
                                                ? "1px solid"
                                                : "none",
                                            borderColor: "divider",
                                          }}
                                        >
                                          <Typography
                                            variant="body2"
                                            sx={{
                                              minWidth: 0,
                                              flex: 1,
                                              lineHeight: 1.25,
                                              wordBreak: "break-word",
                                            }}
                                          >
                                            {mealItem.nameSnapshot}
                                          </Typography>
                                          <Typography
                                            variant="caption"
                                            sx={{
                                              flexShrink: 0,
                                              px: 0.9,
                                              py: 0.25,
                                              borderRadius: 999,
                                              border: "1px solid",
                                              borderColor: "divider",
                                              color: "text.secondary",
                                              lineHeight: 1.2,
                                            }}
                                          >
                                            {Math.round(mealItem.grams)} g
                                          </Typography>
                                        </Stack>
                                      ))}
                                    </Box>
                                  ) : (
                                    <Typography variant="caption" color="text.secondary">
                                      Sin alimentos.
                                    </Typography>
                                  )}
                                  {hasMoreItems && (
                                    <Button
                                      size="small"
                                      variant="text"
                                      onClick={() =>
                                        setCloneShowAllId(showAll ? null : item.id)
                                      }
                                      sx={{ alignSelf: "flex-start", minHeight: 40 }}
                                    >
                                      {showAll ? "Ver menos" : "Ver todos"}
                                    </Button>
                                  )}
                                </Stack>
                              </Collapse>
                            </Stack>
                          </Box>
                        );
                      })}
                    </Stack>
                  </Stack>
                ))}
                {cloneHasMore && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() =>
                      setCloneVisibleCount((prev) => prev + CLONE_PAGE_SIZE)
                    }
                  >
                    Ver mas
                  </Button>
                )}
              </Stack>
            )}

            {mealLibraryError && (
              <Typography variant="caption" color="error">
                {mealLibraryError}
              </Typography>
            )}

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
