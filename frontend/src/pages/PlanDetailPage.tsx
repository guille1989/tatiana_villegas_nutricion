import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  ButtonBase,
  Checkbox,
  IconButton,
  Collapse,
  Card,
  Container,
  Dialog,
  Divider,
  DialogActions,
  DialogContent,
  DialogTitle,
  Fade,
  Snackbar,
  Stack,
  Typography,
  Chip,
  useMediaQuery,
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
import SpaRoundedIcon from "@mui/icons-material/SpaRounded";
import BoltRoundedIcon from "@mui/icons-material/BoltRounded";
import FitnessCenterRoundedIcon from "@mui/icons-material/FitnessCenterRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import RestaurantMenuRoundedIcon from "@mui/icons-material/RestaurantMenuRounded";
import dayjs from "dayjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@mui/material/styles";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import DayEditDialog from "../components/DayEditDialog";
import {
  applyMacroOverrideToOutputs,
  calculateDayFromBase,
  getDayTargetCalories,
  getMacroKcalBreakdown,
  toMacroPortionValue,
  toMacroPortions,
} from "../lib/calc";
import {
  getDistributionKcalDelta,
  getDistributionMacroOverride,
  getMacroDistributionForDay,
} from "../lib/macroDistributions";
import {
  MEAL_DISTRIBUTION_COLUMNS,
  calculateCategoryDistributionMacros,
} from "../lib/mealCategoryDistribution";
import {
  createAdminUserMealTemplate,
  createMealTemplate,
  getPlan,
  listAdminUserMealTemplates,
  listMealTemplates,
  upsertOverride,
  type GeneratedMenu,
  type GeneratedMealOption,
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
import { excelActivityOptions, trainingOptions } from "../lib/schema";
import type {
  Assessment,
  CalculationOutputs,
  DayOverride,
  DayOverrideInputs,
  Meal,
  MealItem,
  MealTemplate,
  Plan,
  PlanMacroDistribution,
  PlanMacroOverride,
  WizardInputs,
} from "../types";

const CLONE_PAGE_SIZE = 6;
const TEMPLATE_DATE_REGEX = /\d{4}-\d{2}-\d{2}/;
const normalizeGeneratedMealName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
const MEAL_TYPE_OPTIONS = [
  "Desayuno",
  "Comida",
  "Cena",
  "Merienda",
  "Merienda 1",
  "Merienda 2",
];
const MOBILE_WEEK_STICKY_TOP = 0;

type DayTypeMeta = {
  label: string;
  description: string;
  color: string;
  Icon: typeof SpaRoundedIcon;
};

const DAY_TYPE_META: Record<string, DayTypeMeta> = {
  rest: {
    label: "Descanso",
    description: "Sin entrenamiento o actividad ligera",
    color: "#2e9e83",
    Icon: SpaRoundedIcon,
  },
  training_type_1: {
    label: "Entreno tipo 1",
    description: "Cardio intenso · alta demanda energetica",
    color: "#e0574f",
    Icon: BoltRoundedIcon,
  },
  training_type_2: {
    label: "Entreno tipo 2",
    description: "Fuerza y recuperacion muscular",
    color: "#d99a2b",
    Icon: FitnessCenterRoundedIcon,
  },
  training: {
    label: "Entreno",
    description: "Entrenamiento",
    color: "#e0574f",
    Icon: BoltRoundedIcon,
  },
};

const formatPerKg = (value: number) =>
  Number.isFinite(value) ? (Math.round(value * 10) / 10).toFixed(1) : "0.0";

const formatInt = (value: number) => Math.round(value);

// Contenedor antiguo de comidas del dia. Oculto mientras se construye la v2.
const SHOW_MEALS_V1 = false;

// Horas sugeridas por comida para simular una linea de tiempo del dia
// (desde la manana hasta la noche). Solo es visual/orientativo.
const MEAL_TIME_HINTS: Record<string, { time: string; suffix: string }> = {
  breakfast: { time: "8:00", suffix: "AM" },
  snack: { time: "11:00", suffix: "AM" },
  lunch: { time: "2:00", suffix: "PM" },
  snack2: { time: "5:30", suffix: "PM" },
  dinner: { time: "9:00", suffix: "PM" },
  extras: { time: "10:30", suffix: "PM" },
};

const DEFAULT_MEAL_TIME = { time: "—", suffix: "" };

type RepeatMode = "replace" | "only_if_empty";

type RepeatConfigSource = {
  activityLevel: DayOverrideInputs["activityLevel"];
  dayType: WizardInputs["dayType"];
  trainings: DayOverrideInputs["trainings"];
};

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
    item.nameSnapshot.toLowerCase().includes(lowered),
  );
};

const PlanDetailPage = () => {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const { isAdmin } = useAuth();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isClientMobile = isMobile && !isAdmin;
  const detailRef = useRef<HTMLDivElement | null>(null);
  const weekSwitcherRef = useRef<HTMLDivElement | null>(null);
  const initialSelectionDoneRef = useRef(false);
  const cloneLibraryRequestedRef = useRef(false);
  const [mobileWeekSwitcherHeight, setMobileWeekSwitcherHeight] = useState(92);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [overrides, setOverrides] = useState<DayOverride[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [weekIndex, setWeekIndex] = useState(0);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [distributionSavingId, setDistributionSavingId] = useState<
    string | null
  >(null);
  const [distributionsExpanded, setDistributionsExpanded] = useState(false);
  const [generatedMenu, setGeneratedMenu] = useState<GeneratedMenu | null>(null);
  const [selectedGeneratedOptions, setSelectedGeneratedOptions] = useState<Record<number, number>>({});
  const [mealChoiceModes, setMealChoiceModes] = useState<
    Partial<Record<Meal["key"], "recipes" | "custom">>
  >({});
  const [generatedAccordionExpanded, setGeneratedAccordionExpanded] = useState<Record<number, boolean>>({});
  const [mealsByDate, setMealsByDate] = useState<Record<string, Meal[]>>({});
  const [mealLibrary, setMealLibrary] = useState<MealTemplate[]>([]);
  const [mealLibraryLoading, setMealLibraryLoading] = useState(false);
  const [mealLibraryError, setMealLibraryError] = useState<string | null>(null);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneSaving, setCloneSaving] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [cloneSourceId, setCloneSourceId] = useState<string | null>(null);
  const [cloneTargetPlanId, setCloneTargetPlanId] = useState<string | null>(
    null,
  );
  const [cloneTargetDate, setCloneTargetDate] = useState<string | null>(null);
  const [cloneTargetMealKey, setCloneTargetMealKey] = useState<
    Meal["key"] | null
  >(null);
  const [cloneTargetMealName, setCloneTargetMealName] = useState<string | null>(
    null,
  );
  const [cloneExpandedId, setCloneExpandedId] = useState<string | null>(null);
  const [cloneShowAllId, setCloneShowAllId] = useState<string | null>(null);
  const [cloneMealType, setCloneMealType] = useState<string | null>(null);
  const [cloneMealTypeLocked, setCloneMealTypeLocked] = useState(true);
  const [cloneSearch, setCloneSearch] = useState("");
  const [cloneVisibleCount, setCloneVisibleCount] = useState(CLONE_PAGE_SIZE);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [repeatSaving, setRepeatSaving] = useState(false);
  const [repeatError, setRepeatError] = useState<string | null>(null);
  const [repeatSourceDate, setRepeatSourceDate] = useState<string | null>(null);
  const [repeatSourceMeal, setRepeatSourceMeal] = useState<Meal | null>(null);
  const [repeatSourceMealCount, setRepeatSourceMealCount] =
    useState<MealCount | null>(null);
  const [repeatTargetDates, setRepeatTargetDates] = useState<string[]>([]);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("replace");
  const [repeatConfigOpen, setRepeatConfigOpen] = useState(false);
  const [repeatConfigSaving, setRepeatConfigSaving] = useState(false);
  const [repeatConfigError, setRepeatConfigError] = useState<string | null>(
    null,
  );
  const [repeatConfigSourceDate, setRepeatConfigSourceDate] = useState<
    string | null
  >(null);
  const [repeatConfigSource, setRepeatConfigSource] =
    useState<RepeatConfigSource | null>(null);
  const [repeatConfigTargetDates, setRepeatConfigTargetDates] = useState<
    string[]
  >([]);
  const [repeatConfigMode, setRepeatConfigMode] =
    useState<RepeatMode>("replace");

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
        },
      )
      .catch((err) => {
        const message =
          err instanceof Error ? err.message : "No se pudo cargar el plan";
        if (
          message.toLowerCase().includes("no encontrado") ||
          message.includes("404")
        ) {
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
    if (!isClientMobile) {
      setMobileWeekSwitcherHeight(0);
      return;
    }

    const node = weekSwitcherRef.current;
    if (!node) return;

    const updateHeight = () => {
      const nextHeight = Math.ceil(node.getBoundingClientRect().height);
      setMobileWeekSwitcherHeight((prev) =>
        prev === nextHeight ? prev : nextHeight,
      );
    };

    updateHeight();
    const handleResize = () => updateHeight();
    window.addEventListener("resize", handleResize);

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => updateHeight());
      observer.observe(node);
      return () => {
        observer.disconnect();
        window.removeEventListener("resize", handleResize);
      };
    }

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [isClientMobile, weekIndex]);

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
      start.add(idx, "day").format("YYYY-MM-DD"),
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
    overrides: PlanMacroOverride[] | undefined,
  ) => {
    if (!date || !overrides || overrides.length === 0) return null;
    const filtered = overrides.filter((item) => item.effectiveFrom <= date);
    if (filtered.length === 0) return null;
    return filtered.reduce((latest, item) =>
      item.effectiveFrom > latest.effectiveFrom ? item : latest,
    );
  };

  const applyMacroOverride = (
    outputs: CalculationOutputs | undefined,
    date: string | null,
    dayType: WizardInputs["dayType"],
    trainingType: WizardInputs["trainingType"] | null,
    activityDelta = 0,
    dayOverride?: DayOverride,
  ) => {
    if (!outputs) return outputs;
    const dailyOverride = dayOverride?.overrides?.macroOverride ?? null;
    const distribution = getMacroDistributionForDay(plan, dayOverride, dayType);
    const distributionOverride = getDistributionMacroOverride(
      plan,
      dayOverride,
      dayType,
      baseInputs?.weight ?? 0,
    );
    const planOverride = getMacroOverrideForDate(date, plan?.macroOverrides);
    const overrideMacros =
      dailyOverride ?? distributionOverride ?? planOverride?.macros ?? null;
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
      targetCaloriesOverride:
        distributionOverride && outputs.kcalObjectiveBase !== undefined
          ? getDayTargetCalories(
              outputs.kcalObjectiveBase,
              dayType,
              getDistributionKcalDelta(distribution),
            )
          : undefined,
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
        const baseOverrides = {
          ...override.overrides,
          activityLevel: undefined,
        };
        const baseOutputs = calculateDayFromBase(baseInputs, baseOverrides);
        const activityOutputs = calculateDayFromBase(
          baseInputs,
          override.overrides,
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
        override,
      );
    if (override?.computed)
      return applyMacroOverride(
        override.computed,
        date,
        dayType,
        trainingType,
        activityDelta,
        override,
      );
    if (override) {
      try {
        return applyMacroOverride(
          calculateDayFromBase(baseInputs, override.overrides),
          date,
          dayType,
          trainingType,
          activityDelta,
          override,
        );
      } catch {
        return applyMacroOverride(
          baseOutputs ?? undefined,
          date,
          dayType,
          trainingType,
          0,
          override,
        );
      }
    }
    return applyMacroOverride(
      baseOutputs ?? undefined,
      date,
      dayType,
      trainingType,
    );
  };

  const getTrainingCount = (override?: DayOverride) => {
    const dayType =
      override?.overrides.dayType ?? baseInputs?.dayType ?? "rest";
    if (dayType === "rest") return 0;
    if (dayType === "training_type_1") return 1;
    if (dayType === "training_type_2") return 2;
    const sessions =
      override?.overrides.trainings?.filter(
        (item) => !!item && (item?.type || item?.durationMin),
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
      ? selectedTrainingCount > 1
        ? "training_type_2"
        : "training_type_1"
      : (selectedOverride?.overrides.dayType ?? baseInputs?.dayType ?? "rest");

  const distributionOptions = useMemo(() => {
    const list = plan?.macroDistributions ?? [];
    return [...list].sort(
      (a, b) =>
        getDistributionKcalDelta(a) - getDistributionKcalDelta(b) ||
        a.name.localeCompare(b.name),
    );
  }, [plan?.macroDistributions]);

  const selectedDistributionId =
    selectedOverride?.overrides?.macroDistributionId ??
    getMacroDistributionForDay(plan, selectedOverride, selectedDayType)?.id ??
    null;

  useEffect(() => {
    if (selectedOverride?.generatedMenu) {
      setGeneratedMenu(selectedOverride.generatedMenu as GeneratedMenu);
      setSelectedGeneratedOptions(selectedOverride.generatedSelections ?? {});
      setGeneratedAccordionExpanded({});
      return;
    }
    const distributionMenu = plan?.macroDistributions?.find(
      (item) => item.id === selectedDistributionId,
    )?.generatedMenu;
    if (distributionMenu) {
      setGeneratedMenu(distributionMenu as GeneratedMenu);
      setSelectedGeneratedOptions({});
      setGeneratedAccordionExpanded({});
      return;
    }
    setGeneratedMenu(null);
    setSelectedGeneratedOptions({});
    setGeneratedAccordionExpanded({});
  }, [selectedOverride?.id, selectedDate, selectedDistributionId, plan?.macroDistributions]);

  const getDistributionPreview = (dist: PlanMacroDistribution) => {
    const outputs = computeOutputs(selectedDate, {
      overrides: {
        ...(selectedOverride?.overrides ?? {}),
        dayType: selectedDayType,
        macroDistributionId: dist.id,
        macroOverride: null,
      },
    } as DayOverride);
    const weight = baseInputs?.weight ?? 0;
    return {
      kcal: outputs?.kcalObjectiveDay ?? null,
      carbsPerKg: dist.carbsPerKg,
      proteinPerKg: dist.proteinPerKg,
      fatPerKg:
        outputs && weight > 0 ? (outputs.fatsAdjusted ?? 0) / weight : 0,
    };
  };

  const handleSelectDistribution = async (dist: PlanMacroDistribution) => {
    if (!planId || !selectedDate) return;
    if (dist.id === selectedDistributionId) return;
    setDistributionSavingId(dist.id);
    const baseOverride = selectedOverride?.overrides ?? {
      dayType: baseInputs?.dayType,
      activityLevel: baseInputs?.activityLevel,
    };
    const meals =
      mealsByDate[selectedDate] ??
      (selectedOverride?.meals as Meal[] | undefined);
    try {
      const record = await upsertOverride({
        planId,
        date: selectedDate,
        overrides: {
          ...baseOverride,
          dayType: baseOverride.dayType ?? selectedDayType,
          macroDistributionId: dist.id,
          macroOverride: null,
        },
        meals,
        note: selectedOverride?.note,
      });
      handleSaved(record);
      setDistributionsExpanded(false);
    } catch (err) {
      console.error(err);
      setError("No se pudo aplicar el reparto");
    } finally {
      setDistributionSavingId(null);
    }
  };

  const dayMealPlan = useMemo(() => {
    const planDistribution = selectedDistributionId
      ? plan?.macroDistributions?.find((item) => item.id === selectedDistributionId)
      : null;
    const legacyDayDistribution = selectedOverride?.overrides?.mealCategoryDistribution;
    const legacySharedDistribution = selectedDistributionId
      ? (overrides.find(
          (item) =>
            item.overrides?.macroDistributionId === selectedDistributionId &&
            (item.overrides?.mealCategoryDistribution?.length ?? 0) > 0,
        )?.overrides?.mealCategoryDistribution ?? null)
      : null;
    const dist =
      planDistribution?.mealCategoryDistribution && planDistribution.mealCategoryDistribution.length > 0
        ? planDistribution.mealCategoryDistribution
        : legacyDayDistribution && legacyDayDistribution.length > 0
          ? legacyDayDistribution
          : legacySharedDistribution && legacySharedDistribution.length > 0
            ? legacySharedDistribution
            : null;
    if (!dist || dist.length === 0) return null;
    const { byMeal } = calculateCategoryDistributionMacros(dist);
    const entries = MEAL_DISTRIBUTION_COLUMNS.map((col) => ({
      key: col.key,
      label: col.label,
      macros: byMeal[col.key] ?? { protein: 0, carbs: 0, fat: 0 },
      categories: dist
        .map((row) => ({
          name: row.name,
          portions: row.portions?.[col.key] ?? 0,
        }))
        .filter((cat) => cat.portions > 0),
    })).filter((entry) => entry.categories.length > 0);
    return entries.length > 0 ? entries : null;
  }, [
    selectedOverride?.overrides?.mealCategoryDistribution,
    selectedDistributionId,
    plan?.macroDistributions,
    overrides,
  ]);

  const generatedOptionToMeal = (
    option: GeneratedMealOption,
    mealIndex: number,
  ): Meal | null => {
    const mealPlanEntry = dayMealPlan?.[mealIndex];
    if (!mealPlanEntry) return null;
    const items = option.ingredients.map((ingredient, ingredientIndex) => ({
      foodId: `generated-${mealPlanEntry.key}-${ingredientIndex}`,
      nameSnapshot: ingredient.name,
      grams: ingredient.grams,
      macros: {
        protein: ingredient.protein,
        carbs: ingredient.carbs,
        fat: ingredient.fat,
      },
      kcal: Math.round(ingredient.protein * 4 + ingredient.carbs * 4 + ingredient.fat * 9),
    }));
    return {
      key: mealPlanEntry.key as Meal["key"],
      name: mealPlanEntry.label,
      items,
      totals: {
        protein: option.totals.protein,
        carbs: option.totals.carbs,
        fat: option.totals.fat,
        kcal: option.totals.kcal,
      },
    };
  };

  const saveGeneratedSelections = async (selections: Record<number, number>) => {
    if (!generatedMenu || !dayMealPlan) return;
    const selectedMeals = generatedMenu.meals
      .map((meal, mealIndex) => {
        const optionIndex = selections[mealIndex];
        if (optionIndex === undefined) return null;
        const option = meal.options[optionIndex];
        return option ? generatedOptionToMeal(option, mealIndex) : null;
      })
      .filter((meal): meal is Meal => meal !== null);
    if (selectedMeals.length === 0) {
      return;
    }
    const replacements = new Map(selectedMeals.map((meal) => [meal.key, meal]));
    const mergedMeals = currentMeals.map(
      (meal) => replacements.get(meal.key) ?? meal,
    );
    selectedMeals.forEach((meal) => {
      if (!mergedMeals.some((item) => item.key === meal.key)) mergedMeals.push(meal);
    });
    await handleSaveMeals(mergedMeals, {
      generatedMenu,
      generatedSelections: selections,
    });
  };

  const handleSelectGeneratedOption = (
    mealIndex: number,
    optionIndex: number,
  ) => {
    const nextSelections = {
      ...selectedGeneratedOptions,
      [mealIndex]: optionIndex,
    };
    setSelectedGeneratedOptions(nextSelections);
    const mealKey = dayMealPlan?.[mealIndex]?.key;
    if (mealKey) {
      setMealChoiceModes((prev) => ({
        ...prev,
        [mealKey as Meal["key"]]: "recipes",
      }));
    }
    void saveGeneratedSelections(nextSelections);
  };

  const renderGeneratedMealOption = (
    opt: GeneratedMealOption,
    mealIndex: number,
    optionIndex: number,
  ) => {
    const selected = selectedGeneratedOptions[mealIndex] === optionIndex;
    return (
      <Stack
        key={`${opt.name}-${optionIndex}`}
        spacing={1}
        role="button"
        tabIndex={0}
        onClick={() => handleSelectGeneratedOption(mealIndex, optionIndex)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleSelectGeneratedOption(mealIndex, optionIndex);
          }
        }}
        sx={{
          p: 1.5,
          borderRadius: 2.5,
          border: "1px solid",
          borderColor: selected ? "primary.main" : "divider",
          bgcolor: selected ? "primary.50" : "background.paper",
          cursor: "pointer",
          transition: "border-color 160ms ease, box-shadow 160ms ease",
          "&:hover": {
            borderColor: "primary.main",
            boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
          },
        }}
      >
        <Box>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
            <Typography variant="body2" fontWeight={700}>
              {opt.name}
            </Typography>
          </Stack>
        </Box>

        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5 }}>
          <Box
            sx={{
              display: "inline-flex",
              alignItems: "center",
              px: 0.85,
              py: 0.25,
              borderRadius: 999,
              bgcolor: "grey.100",
              fontWeight: 700,
              fontSize: 12,
            }}
          >
            {formatInt(opt.totals.kcal)} kcal
          </Box>
          {[
            {
              label: "P",
              value: opt.totals.protein,
              color: theme.palette.primary.main,
            },
            {
              label: "C",
              value: opt.totals.carbs,
              color: theme.palette.success.main,
            },
            {
              label: "G",
              value: opt.totals.fat,
              color: theme.palette.warning.main,
            },
          ].map((m) => (
            <Box
              key={m.label}
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.5,
                px: 0.85,
                py: 0.25,
                borderRadius: 999,
                bgcolor: m.color + "1F",
                color: m.color,
              }}
            >
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  bgcolor: m.color,
                }}
              />
              <Typography variant="caption" fontWeight={700}>
                {m.label} {formatInt(m.value)}
              </Typography>
            </Box>
          ))}
        </Stack>

        <Divider sx={{ my: 0.25 }} />

        <Stack spacing={0.4}>
          {opt.ingredients.map((ing, i) => (
            <Stack
              key={`${ing.name}-${i}`}
              direction="row"
              justifyContent="space-between"
              spacing={1}
            >
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 0 }}>
                {ing.name}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                fontWeight={600}
                sx={{ flexShrink: 0 }}
              >
                {formatInt(ing.grams)} g
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Stack>
    );
  };

  const renderDistributionCard = (
    dist: PlanMacroDistribution,
    options?: { asHeader?: boolean; expandable?: boolean },
  ) => {
    const asHeader = options?.asHeader ?? false;
    const expandable = options?.expandable ?? false;
    const kcalDelta = getDistributionKcalDelta(dist);
    const meta =
      DAY_TYPE_META[dist.dayType ?? (kcalDelta === 0 ? "rest" : "training")] ??
      DAY_TYPE_META.training;
    const preview = getDistributionPreview(dist);
    const isSelected = dist.id === selectedDistributionId;
    const isSaving = distributionSavingId === dist.id;
    const Icon = meta.Icon;
    return (
      <ButtonBase
        key={dist.id}
        onClick={() =>
          asHeader
            ? setDistributionsExpanded((prev) => !prev)
            : handleSelectDistribution(dist)
        }
        disabled={!asHeader && distributionSavingId !== null}
        aria-pressed={asHeader ? undefined : isSelected}
        aria-expanded={asHeader ? distributionsExpanded : undefined}
        aria-label={
          asHeader
            ? distributionsExpanded
              ? "Ocultar opciones de entrenamiento"
              : "Ver opciones de entrenamiento"
            : `Aplicar ${dist.name}`
        }
        sx={{
          display: "block",
          width: "100%",
          textAlign: "left",
          borderRadius: 3,
          p: { xs: 1.25, md: 1.5 },
          position: "relative",
          overflow: "hidden",
          border: "1.5px solid",
          borderColor: isSelected ? "rgba(0, 97, 86, 0.55)" : "divider",
          bgcolor: isSelected ? "rgba(0, 97, 86, 0.06)" : "background.paper",
          opacity: distributionSavingId !== null && !isSaving ? 0.6 : 1,
          transition:
            "border-color 200ms ease, background-color 200ms ease, box-shadow 200ms ease",
          boxShadow: isSelected ? "0 6px 16px rgba(0, 97, 86, 0.10)" : "none",
          "&:hover": {
            borderColor: isSelected
              ? "rgba(0, 97, 86, 0.6)"
              : "rgba(148, 163, 184, 0.5)",
          },
          "&::before": {
            content: '""',
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 4,
            bgcolor: meta.color,
          },
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center" pl={0.75}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              flexShrink: 0,
              display: "grid",
              placeItems: "center",
              bgcolor: `${meta.color}1f`,
              color: meta.color,
            }}
          >
            <Icon fontSize="small" />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              fontWeight={800}
              noWrap
              sx={{ color: "text.primary" }}
            >
              {dist.name}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", lineHeight: 1.3 }}
              noWrap
            >
              {kcalDelta >= 0 ? "+" : ""}
              {formatInt(kcalDelta)} kcal
            </Typography>
            <Typography
              variant="caption"
              sx={{
                display: "block",
                mt: 0.5,
                fontWeight: 600,
                color: "text.secondary",
              }}
            >
              HC {formatPerKg(preview.carbsPerKg)} · PRO{" "}
              {formatPerKg(preview.proteinPerKg)} · GRA{" "}
              {formatPerKg(preview.fatPerKg)} g/kg
            </Typography>
          </Box>
          <Stack alignItems="flex-end" spacing={0.5} flexShrink={0}>
            {isSelected && !asHeader && (
              <CheckCircleRoundedIcon
                fontSize="small"
                sx={{ color: "#006156" }}
              />
            )}
            {preview.kcal !== null && (
              <Typography
                variant="body2"
                fontWeight={800}
                sx={{ color: meta.color, whiteSpace: "nowrap" }}
              >
                {formatInt(preview.kcal)} kcal
              </Typography>
            )}
            {isSaving && (
              <LinearProgress sx={{ width: 48, borderRadius: 999 }} />
            )}
          </Stack>
          {expandable && (
            <ExpandMoreRoundedIcon
              sx={{
                flexShrink: 0,
                color: "text.secondary",
                transform: distributionsExpanded
                  ? "rotate(180deg)"
                  : "rotate(0deg)",
                transition: "transform 200ms ease",
              }}
            />
          )}
        </Stack>
      </ButtonBase>
    );
  };

  const selectedDistribution =
    distributionOptions.find((dist) => dist.id === selectedDistributionId) ??
    null;
  const otherDistributions = distributionOptions.filter(
    (dist) => dist.id !== selectedDistribution?.id,
  );

  const distributionSelector =
    distributionOptions.length === 0 ? null : selectedDistribution ? (
      <Stack spacing={1.25}>
        {renderDistributionCard(selectedDistribution, {
          asHeader: otherDistributions.length > 0,
          expandable: otherDistributions.length > 0,
        })}
        {otherDistributions.length > 0 && (
          <Collapse in={distributionsExpanded} timeout="auto" unmountOnExit>
            <Stack spacing={1.25}>
              {otherDistributions.map((dist) => renderDistributionCard(dist))}
            </Stack>
          </Collapse>
        )}
      </Stack>
    ) : (
      <Stack spacing={1.25}>
        {distributionOptions.map((dist) => renderDistributionCard(dist))}
      </Stack>
    );

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
    template: Meal[],
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
      { protein: 0, carbs: 0, fat: 0, kcal: 0 },
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

  const formatPortions = (value: number) =>
    (Math.round(value * 10) / 10).toFixed(1);

  const buildMealTemplateName = (
    mealName: string,
    dateLabel: string,
    usedNames: Set<string>,
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
    budget: { protein: number; carbs: number; fat: number },
  ): DayStatus => {
    const states: DayStatus[] = (["protein", "carbs", "fat"] as const).map(
      (key) => getMacroState(remaining[key], budget[key], key),
    ) as DayStatus[];
    if (states.includes("over")) return "over";
    if (states.every((s) => s === "ok")) return "ok";
    return "pending";
  };

  const getDayMeals = (date: string) =>
    mealsByDate[date] ||
    (overrides.find((o) => o.date === date)?.meals as Meal[] | undefined) ||
    [];

  const getDayOverride = (date: string) =>
    date === selectedDate
      ? selectedOverride
      : overrides.find((item) => item.date === date);

  const hasConfigOverride = (override?: DayOverride | null) => {
    if (!override) return false;
    const cfg = override.overrides ?? {};
    const hasTrainings =
      (cfg.trainings ?? []).some(
        (item) =>
          !!item &&
          (!!item.type ||
            item.durationMin !== undefined ||
            item.met !== undefined),
      ) ||
      (!!cfg.training &&
        (!!cfg.training.type ||
          cfg.training.durationMin !== undefined ||
          cfg.training.met !== undefined));
    return (
      cfg.activityLevel !== undefined ||
      cfg.dayType !== undefined ||
      hasTrainings
    );
  };

  const rawMeals =
    (selectedDate && mealsByDate[selectedDate]) ||
    (selectedOverride?.meals as Meal[] | undefined);
  const distributionMealTemplate: Meal[] = (dayMealPlan ?? []).map((meal) => ({
    key: meal.key as Meal["key"],
    name: meal.label,
    items: [],
    totals: { protein: 0, carbs: 0, fat: 0, kcal: 0 },
  }));
  const storedMealCount = getMealCount(rawMeals);
  const mealTemplate =
    distributionMealTemplate.length > 0
      ? distributionMealTemplate
      : storedMealCount
        ? getMealsByCount(storedMealCount)
        : [];
  const currentMeals =
    mealTemplate.length > 0 ? mergeMealsWithTemplate(rawMeals, mealTemplate) : [];
  const mealCount = getMealCount(currentMeals);
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
  const mealTargets = dayMealPlan
    ? dayMealPlan.reduce(
        (targets, meal) => ({
          ...targets,
          [meal.key]: meal.macros,
        }),
        distributeMacros(dailyMacros, []),
      )
    : distributeMacros(
        dailyMacros,
        mealCount ? getWeightsByCount(mealCount) : [],
      );

  useEffect(() => {
    if (!dayMealPlan) {
      setMealChoiceModes({});
      return;
    }
    const selections = selectedOverride?.generatedSelections ?? {};
    const nextModes: Partial<Record<Meal["key"], "recipes" | "custom">> = {};
    dayMealPlan.forEach((meal, index) => {
      const key = meal.key as Meal["key"];
      const storedMeal = currentMeals.find((item) => item.key === key);
      nextModes[key] =
        selections[index] !== undefined
          ? "recipes"
          : storedMeal?.items.length
            ? "custom"
            : "recipes";
    });
    setMealChoiceModes(nextModes);
  }, [selectedDate, selectedOverride?.id, dayMealPlan]);

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
      matchesMealType(item, cloneMealType),
    );
    const filteredBySearch = cloneSearch.trim()
      ? filteredByType.filter((item) =>
          matchesTemplateSearch(item, cloneSearch),
        )
      : filteredByType;
    return filteredBySearch.slice().sort((a, b) => {
      const dateDiff = dayjs(getTemplateDateKey(b)).diff(
        dayjs(getTemplateDateKey(a)),
      );
      if (dateDiff !== 0) return dateDiff;
      return dayjs(b.createdAt).diff(dayjs(a.createdAt));
    });
  }, [cloneMealType, cloneSearch, mealLibrary]);
  const cloneVisibleTemplates = cloneSortedTemplates.slice(
    0,
    cloneVisibleCount,
  );
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
  const cloneEmpty = !mealLibraryLoading && cloneSortedTemplates.length === 0;

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

  const handleSaveMeals = async (
    mealsOverride?: Meal[] | unknown,
    generatedPayload?: {
      generatedMenu?: GeneratedMenu | null
      generatedSelections?: Record<number, number>
    },
  ) => {
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
        generatedMenu: generatedPayload?.generatedMenu ?? selectedOverride?.generatedMenu,
        generatedSelections:
          generatedPayload?.generatedSelections ?? selectedOverride?.generatedSelections,
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

  const handleChooseCustomMeal = async (
    mealIndex: number,
    mealKey: Meal["key"],
    mealName: string,
  ) => {
    const nextSelections = { ...selectedGeneratedOptions };
    const wasGenerated = nextSelections[mealIndex] !== undefined;
    delete nextSelections[mealIndex];
    setSelectedGeneratedOptions(nextSelections);
    setMealChoiceModes((prev) => ({ ...prev, [mealKey]: "custom" }));

    if (!wasGenerated) return;
    const nextMeals = currentMeals.map((meal) =>
      meal.key === mealKey
        ? {
            key: mealKey,
            name: mealName,
            items: [],
            totals: { protein: 0, carbs: 0, fat: 0, kcal: 0 },
          }
        : meal,
    );
    handleMealsChange(nextMeals);
    await handleSaveMeals(nextMeals, {
      generatedMenu,
      generatedSelections: nextSelections,
    });
  };

  const handleSaveCustomMeal = async (
    mealIndex: number,
    mealKey: Meal["key"],
    meals: Meal[],
  ) => {
    const nextSelections = { ...selectedGeneratedOptions };
    delete nextSelections[mealIndex];
    setSelectedGeneratedOptions(nextSelections);
    setMealChoiceModes((prev) => ({ ...prev, [mealKey]: "custom" }));
    await handleSaveMeals(meals, {
      generatedMenu,
      generatedSelections: nextSelections,
    });
  };

  const saveMealsToLibrary = async (meals: Meal[]) => {
    if (!selectedDate) return;
    if (isAdmin && !plan?.userId) return;
    const candidates = meals.filter((meal) => meal.items.length > 0);
    if (candidates.length === 0) return;
    let templates = mealLibrary;
    if (templates.length === 0) {
      try {
        templates =
          isAdmin && plan?.userId
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
          isAdmin && plan?.userId
            ? createAdminUserMealTemplate(plan.userId, {
                name: buildMealTemplateName(meal.name, dateLabel, usedNames),
                items: meal.items,
                totals: meal.totals,
              })
            : createMealTemplate({
                name: buildMealTemplateName(meal.name, dateLabel, usedNames),
                items: meal.items,
                totals: meal.totals,
              }),
        ),
      );
      setMealLibrary((prev) => {
        const map = new Map<string, MealTemplate>();
        templates.forEach((item) => map.set(item.id, item));
        prev.forEach((item) => map.set(item.id, item));
        created.forEach((item) => map.set(item.id, item));
        return Array.from(map.values()).sort((a, b) =>
          dayjs(b.createdAt).diff(dayjs(a.createdAt)),
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
        err instanceof Error ? err.message : "No se pudo cargar la biblioteca",
      );
    } finally {
      setMealLibraryLoading(false);
    }
  };

  const handleOpenRepeatMeal = (meal: Meal) => {
    if (!planId || !selectedDate) {
      setSnackbar("Selecciona un dia para repetir el plato");
      return;
    }
    if (!meal.items.length) {
      setSnackbar("Primero arma un plato");
      return;
    }
    const sourceMealCount = getMealCount(currentMeals);
    if (!sourceMealCount) {
      setSnackbar("Configura las comidas del dia antes de repetir");
      return;
    }
    setRepeatOpen(true);
    setRepeatSaving(false);
    setRepeatError(null);
    setRepeatSourceDate(selectedDate);
    setRepeatSourceMealCount(sourceMealCount);
    setRepeatTargetDates([]);
    setRepeatMode("replace");
    setRepeatSourceMeal({
      ...meal,
      items: meal.items.map((item) => ({
        ...item,
        macros: { ...item.macros },
      })),
      totals: { ...meal.totals },
    });
  };

  const handleCloseRepeatMeal = () => {
    setRepeatOpen(false);
    setRepeatSaving(false);
    setRepeatError(null);
    setRepeatSourceDate(null);
    setRepeatSourceMeal(null);
    setRepeatSourceMealCount(null);
    setRepeatTargetDates([]);
    setRepeatMode("replace");
  };

  const handleConfirmRepeatMeal = async () => {
    if (!planId || !repeatSourceMeal || !repeatSourceDate) {
      setRepeatError("No se pudo identificar el plato origen.");
      return;
    }
    const today = dayjs().startOf("day");
    const sourceDay = dayjs(repeatSourceDate).startOf("day");
    const validTargetSet = new Set(
      dates.filter((date) => {
        const day = dayjs(date).startOf("day");
        return day.isAfter(today, "day") && day.isAfter(sourceDay, "day");
      }),
    );
    const targetDates = repeatTargetDates.filter((date) =>
      validTargetSet.has(date),
    );
    if (targetDates.length === 0) {
      setRepeatError("Selecciona al menos un dia futuro dentro del plan.");
      return;
    }
    const fallbackMealCount =
      repeatSourceMealCount ?? getMealCount(currentMeals);
    if (!fallbackMealCount) {
      setRepeatError(
        "No se pudo determinar el numero de comidas para repetir.",
      );
      return;
    }

    setRepeatSaving(true);
    setRepeatError(null);
    try {
      const results = await Promise.allSettled(
        targetDates.map(async (targetDate) => {
          const targetBaseMeals =
            targetDate === selectedDate
              ? currentMeals
              : getDayMeals(targetDate);
          const targetMealCount =
            getMealCount(targetBaseMeals) ?? fallbackMealCount;
          const mergedMeals = mergeMealsWithTemplate(
            targetBaseMeals,
            getMealsByCount(targetMealCount),
          );
          const targetMeal = mergedMeals.find(
            (meal) => meal.key === repeatSourceMeal.key,
          );
          if (!targetMeal) {
            return { kind: "skipped" as const, date: targetDate };
          }
          if (repeatMode === "only_if_empty" && targetMeal.items.length > 0) {
            return { kind: "skipped" as const, date: targetDate };
          }

          const nextMeals = mergedMeals.map((meal) => {
            if (meal.key !== repeatSourceMeal.key) return meal;
            return {
              ...meal,
              items: repeatSourceMeal.items.map((item) => ({
                ...item,
                macros: { ...item.macros },
              })),
              totals: { ...repeatSourceMeal.totals },
            };
          });

          const existingOverride =
            targetDate === selectedDate
              ? selectedOverride
              : overrides.find((item) => item.date === targetDate);
          const planAssessment = assessment ?? undefined;
          const baseOverride =
            existingOverride?.overrides ??
            (planAssessment?.inputs
              ? {
                  dayType: planAssessment.inputs.dayType,
                  activityLevel: planAssessment.inputs.activityLevel,
                }
              : {});

          const record = await upsertOverride({
            planId,
            date: targetDate,
            overrides: baseOverride,
            meals: nextMeals,
          });

          return { kind: "saved" as const, record };
        }),
      );

      const savedRecords: DayOverride[] = [];
      let skippedCount = 0;
      let failedCount = 0;
      results.forEach((result) => {
        if (result.status === "rejected") {
          failedCount += 1;
          return;
        }
        if (result.value.kind === "saved") {
          savedRecords.push(result.value.record);
        } else {
          skippedCount += 1;
        }
      });

      if (savedRecords.length > 0) {
        setOverrides((prev) => {
          const map = new Map(prev.map((item) => [item.date, item]));
          savedRecords.forEach((record) => map.set(record.date, record));
          return Array.from(map.values());
        });
        setMealsByDate((prev) => {
          const next = { ...prev };
          savedRecords.forEach((record) => {
            next[record.date] = (record.meals ?? []) as Meal[];
          });
          return next;
        });
        handleCloseRepeatMeal();
      }

      if (savedRecords.length === 0) {
        setRepeatError(
          skippedCount > 0 && failedCount === 0
            ? "No se aplico en ningun dia (ya tenian plato o no eran compatibles)."
            : "No se pudo aplicar la repeticion.",
        );
      }

      const summaryParts = [];
      if (savedRecords.length > 0)
        summaryParts.push(`Aplicado en ${savedRecords.length} dias`);
      if (skippedCount > 0) summaryParts.push(`${skippedCount} omitidos`);
      if (failedCount > 0) summaryParts.push(`${failedCount} con error`);
      if (summaryParts.length > 0) {
        setSnackbar(summaryParts.join(" · "));
      }
    } catch (err) {
      setRepeatError("No se pudo repetir el plato.");
    } finally {
      setRepeatSaving(false);
    }
  };

  const handleCloseRepeatConfig = () => {
    setRepeatConfigOpen(false);
    setRepeatConfigSaving(false);
    setRepeatConfigError(null);
    setRepeatConfigSourceDate(null);
    setRepeatConfigSource(null);
    setRepeatConfigTargetDates([]);
    setRepeatConfigMode("replace");
  };

  const handleConfirmRepeatConfig = async () => {
    if (!planId || !repeatConfigSourceDate || !repeatConfigSource) {
      setRepeatConfigError("No se pudo identificar la configuracion origen.");
      return;
    }
    const today = dayjs().startOf("day");
    const sourceDay = dayjs(repeatConfigSourceDate).startOf("day");
    const validTargetSet = new Set(
      dates.filter((date) => {
        const day = dayjs(date).startOf("day");
        return day.isAfter(today, "day") && day.isAfter(sourceDay, "day");
      }),
    );
    const targetDates = repeatConfigTargetDates.filter((date) =>
      validTargetSet.has(date),
    );
    if (targetDates.length === 0) {
      setRepeatConfigError(
        "Selecciona al menos un dia futuro dentro del plan.",
      );
      return;
    }

    setRepeatConfigSaving(true);
    setRepeatConfigError(null);
    try {
      const results = await Promise.allSettled(
        targetDates.map(async (targetDate) => {
          const existingOverride = getDayOverride(targetDate);
          if (
            repeatConfigMode === "only_if_empty" &&
            hasConfigOverride(existingOverride)
          ) {
            return { kind: "skipped" as const, date: targetDate };
          }

          const baseOverride = existingOverride?.overrides ?? {};
          const nextOverrides: DayOverrideInputs = {
            ...baseOverride,
            activityLevel: repeatConfigSource.activityLevel,
            dayType: repeatConfigSource.dayType,
            trainings:
              repeatConfigSource.dayType === "training"
                ? (repeatConfigSource.trainings ?? []).map((item) =>
                    item
                      ? {
                          type: item.type ?? undefined,
                          met: item.met ?? undefined,
                          durationMin: item.durationMin ?? undefined,
                        }
                      : null,
                  )
                : null,
            // Keep legacy field cleared when applying normalized multi-training config.
            training: undefined,
          };

          const record = await upsertOverride({
            planId,
            date: targetDate,
            overrides: nextOverrides,
            meals: existingOverride?.meals,
            note: existingOverride?.note,
          });

          return { kind: "saved" as const, record };
        }),
      );

      const savedRecords: DayOverride[] = [];
      let skippedCount = 0;
      let failedCount = 0;

      results.forEach((result) => {
        if (result.status === "rejected") {
          failedCount += 1;
          return;
        }
        if (result.value.kind === "saved") {
          savedRecords.push(result.value.record);
        } else {
          skippedCount += 1;
        }
      });

      if (savedRecords.length > 0) {
        setOverrides((prev) => {
          const map = new Map(prev.map((item) => [item.date, item]));
          savedRecords.forEach((record) => map.set(record.date, record));
          return Array.from(map.values());
        });
        handleCloseRepeatConfig();
      }

      if (savedRecords.length === 0) {
        setRepeatConfigError(
          skippedCount > 0 && failedCount === 0
            ? "No se aplico en ningun dia (ya tenian configuracion)."
            : "No se pudo aplicar la configuracion.",
        );
      }

      const summaryParts = [];
      if (savedRecords.length > 0)
        summaryParts.push(`Aplicado en ${savedRecords.length} dias`);
      if (skippedCount > 0) summaryParts.push(`${skippedCount} omitidos`);
      if (failedCount > 0) summaryParts.push(`${failedCount} con error`);
      if (summaryParts.length > 0) {
        setSnackbar(summaryParts.join(" · "));
      }
    } catch (err) {
      setRepeatConfigError("No se pudo repetir la configuracion.");
    } finally {
      setRepeatConfigSaving(false);
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
      getMealsByCount(baseMealCount),
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
    cloneTargetDate && cloneTargetPlanId === plan?.id
      ? getDayData(cloneTargetDate)
      : null;
  const cloneTargetBaseMeals =
    cloneTargetDate && cloneTargetPlanId === plan?.id
      ? getDayMeals(cloneTargetDate)
      : [];
  const cloneTargetMealCount = getMealCount(cloneTargetBaseMeals);
  const cloneTargetMealMacros =
    cloneTargetMealKey && cloneTargetDayData?.outputs && cloneTargetMealCount
      ? distributeMacros(
          {
            protein: cloneTargetDayData.outputs.protein,
            carbs: cloneTargetDayData.outputs.carbsAdjusted,
            fat: cloneTargetDayData.outputs.fatsAdjusted,
          },
          getWeightsByCount(cloneTargetMealCount),
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
              cloneTargetMealMacros.fat * 9,
          ),
        }
      : null;
  const cloneTargetPortions = cloneTargetSummary
    ? toMacroPortions({
        protein: cloneTargetSummary.protein,
        carbs: cloneTargetSummary.carbs,
        fat: cloneTargetSummary.fat,
      })
    : null;
  const repeatEligibleDates = useMemo(() => {
    if (!repeatSourceDate) return [];
    const today = dayjs().startOf("day");
    const sourceDay = dayjs(repeatSourceDate).startOf("day");
    return dates.filter((date) => {
      const current = dayjs(date).startOf("day");
      return current.isAfter(today, "day") && current.isAfter(sourceDay, "day");
    });
  }, [dates, repeatSourceDate]);
  const repeatEligibleDateSet = useMemo(
    () => new Set(repeatEligibleDates),
    [repeatEligibleDates],
  );
  const repeatSelectedCount = repeatTargetDates.filter((date) =>
    repeatEligibleDateSet.has(date),
  ).length;
  const repeatSourcePortions = repeatSourceMeal
    ? toMacroPortions({
        protein: repeatSourceMeal.totals.protein,
        carbs: repeatSourceMeal.totals.carbs,
        fat: repeatSourceMeal.totals.fat,
      })
    : null;
  const repeatApplyDisabled =
    repeatSaving || !repeatSourceMeal || repeatSelectedCount === 0;
  const repeatConfigEligibleDates = useMemo(() => {
    if (!repeatConfigSourceDate) return [];
    const today = dayjs().startOf("day");
    const sourceDay = dayjs(repeatConfigSourceDate).startOf("day");
    return dates.filter((date) => {
      const current = dayjs(date).startOf("day");
      return current.isAfter(today, "day") && current.isAfter(sourceDay, "day");
    });
  }, [dates, repeatConfigSourceDate]);
  const repeatConfigEligibleDateSet = useMemo(
    () => new Set(repeatConfigEligibleDates),
    [repeatConfigEligibleDates],
  );
  const repeatConfigSelectedCount = repeatConfigTargetDates.filter((date) =>
    repeatConfigEligibleDateSet.has(date),
  ).length;
  const repeatConfigApplyDisabled =
    repeatConfigSaving ||
    !repeatConfigSource ||
    repeatConfigSelectedCount === 0;
  const repeatConfigSourceTrainingCount =
    repeatConfigSource?.dayType === "training_type_1"
      ? 1
      : repeatConfigSource?.dayType === "training_type_2"
        ? 2
        : repeatConfigSource?.dayType === "training"
      ? (repeatConfigSource.trainings ?? []).filter(
          (item) =>
            !!item &&
            (!!item.type ||
              item.durationMin !== undefined ||
              item.met !== undefined),
        ).length
      : 0;
  const repeatConfigSourceSummary = repeatConfigSource
    ? repeatConfigSource.dayType !== "rest"
      ? repeatConfigSource.dayType === "training_type_2"
        ? "Entreno tipo 2"
        : "Entreno tipo 1"
      : "Descanso"
    : null;
  const repeatConfigActivityLabel = useMemo(() => {
    if (!repeatConfigSource?.activityLevel) return "Sin cambio";
    const option = excelActivityOptions.find(
      (item) => item.value === repeatConfigSource.activityLevel,
    );
    if (!option) return repeatConfigSource.activityLevel;
    return option.label.split(":")[0]?.trim() || option.label;
  }, [repeatConfigSource?.activityLevel]);
  const repeatConfigSourceTrainingDetails = useMemo(() => {
    if (!repeatConfigSource || repeatConfigSource.dayType !== "training")
      return [];
    return (repeatConfigSource.trainings ?? [])
      .filter(
        (item): item is NonNullable<typeof item> =>
          !!item &&
          (!!item.type ||
            item.durationMin !== undefined ||
            item.met !== undefined),
      )
      .map((item, idx) => {
        const option = trainingOptions.find((opt) => opt.value === item.type);
        const label = option?.label ?? item.type ?? `Entreno ${idx + 1}`;
        const duration =
          item.durationMin !== undefined && item.durationMin !== null
            ? `${Math.round(item.durationMin)} min`
            : "duracion no definida";
        const met =
          item.met !== undefined && item.met !== null
            ? `MET ${Number(item.met).toFixed(1).replace(/\.0$/, "")}`
            : null;
        return { label, duration, met };
      });
  }, [repeatConfigSource]);

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

    const { proteinKcal, carbsKcal, fatKcal, totalKcal } =
      getMacroKcalBreakdown({
        protein,
        carbs,
        fat: fats,
      });
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
    <Container maxWidth="lg" sx={{ py: { xs: 2, md: 5 } }}>
      <Stack spacing={{ xs: 2, md: 3 }}>
        {!isClientMobile && (
          <Stack
            direction={{ xs: "column", md: "row" }}
            justifyContent="space-between"
            spacing={1}
            alignItems={{ xs: "flex-start", md: "center" }}
            sx={{ pt: 1 }}
          >
            <Stack spacing={0.5}>
              <Typography variant="h5" fontWeight={800}>
                {plan.title ?? `Plan ${plan.days} dias`}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Inicio: {dayjs(plan.startDate).format("DD MMM YYYY")} ·
                Duracion: {plan.days} dias
              </Typography>
              {assessment && assessment.id !== plan.baseAssessmentId && (
                <Typography variant="caption" color="text.secondary">
                  Este plan se creo con otra evaluacion. Se usa la asociada al
                  plan.
                </Typography>
              )}
            </Stack>
          </Stack>
        )}

        {!baseOutputs && (
          <Alert severity="warning">
            No hay outputs base cargados. Guarda una evaluacion y vuelve a abrir
            el plan.
          </Alert>
        )}

        {isClientMobile && (
          <Box aria-hidden="true" sx={{ height: mobileWeekSwitcherHeight }} />
        )}

        {/* Week switcher */}
        <Stack
          ref={weekSwitcherRef}
          spacing={isClientMobile ? 0 : 1.5}
          sx={
            isClientMobile
              ? {
                  position: "fixed",
                  top: MOBILE_WEEK_STICKY_TOP,
                  left: -5,
                  right: "auto",
                  mt: "0 !important",
                  zIndex: 30,
                  width: "calc(100vw + 10px)",
                  maxWidth: "none",
                  boxSizing: "border-box",
                  py: 0,
                  px: 0,
                  bgcolor: "rgba(252, 253, 252, 0.96)",
                  borderBottom: "1px solid",
                  borderColor: "rgba(102, 179, 154, 0.24)",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                  boxShadow: "0 8px 20px rgba(15, 23, 42, 0.08)"
                }
              : undefined
          }
        >
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={isClientMobile ? 0.75 : 1}
            sx={isClientMobile ? { px: 1.25, pt: 0.4, pb: 0.2 } : undefined}
          >
            <Stack
              direction="row"
              spacing={isClientMobile ? 0.5 : 1}
              alignItems="center"
            >
              <IconButton
                size="small"
                onClick={() => handleWeekChange(weekIndex - 1)}
                disabled={!canGoPrevWeek}
                aria-label="Semana anterior"
                sx={
                  isClientMobile
                    ? {
                        p: 0.45,
                        borderRadius: "10px",
                        bgcolor: "rgba(15, 23, 42, 0.045)",
                        color: "rgba(15, 23, 42, 0.7)",
                        transition: "background-color 220ms ease, color 220ms ease",
                        "&:hover": {
                          bgcolor: "rgba(15, 23, 42, 0.085)",
                        },
                        "&.Mui-disabled": {
                          opacity: 0.35,
                        },
                      }
                    : undefined
                }
              >
                <ChevronLeftRoundedIcon />
              </IconButton>
              <Typography
                variant="subtitle2"
                fontWeight={700}
                sx={
                  isClientMobile
                    ? {
                        fontSize: 13.5,
                        lineHeight: 1.15,
                        letterSpacing: "0.01em",
                        color: "#0f172a",
                      }
                    : undefined
                }
              >
                Semana {weekIndex + 1} de {weeks.length}
              </Typography>
              <IconButton
                size="small"
                onClick={() => handleWeekChange(weekIndex + 1)}
                disabled={!canGoNextWeek}
                aria-label="Semana siguiente"
                sx={
                  isClientMobile
                    ? {
                        p: 0.45,
                        borderRadius: "10px",
                        bgcolor: "rgba(15, 23, 42, 0.045)",
                        color: "rgba(15, 23, 42, 0.7)",
                        transition: "background-color 220ms ease, color 220ms ease",
                        "&:hover": {
                          bgcolor: "rgba(15, 23, 42, 0.085)",
                        },
                        "&.Mui-disabled": {
                          opacity: 0.35,
                        },
                      }
                    : undefined
                }
              >
                <ChevronRightRoundedIcon />
              </IconButton>
            </Stack>
            {visibleDates.length > 0 && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={
                  isClientMobile
                    ? {
                        fontSize: 10.5,
                        opacity: 0.65,
                        fontWeight: 500,
                        color: "rgba(71, 85, 105, 0.8)",
                        letterSpacing: "0.01em",
                      }
                    : undefined
                }
              >
                {dayjs(visibleDates[0]).format("DD MMM")} -{" "}
                {dayjs(visibleDates[visibleDates.length - 1]).format("DD MMM")}
              </Typography>
            )}
          </Stack>
          <Stack
            direction="row"
            spacing={isClientMobile ? 1 : 1.25}
            sx={{
              overflowX: "auto",
              px: isClientMobile ? 1.25 : 0,
              pt: isClientMobile ? 0.25 : 0,
              pb: isClientMobile ? 0.8 : 0.5,
              whiteSpace: "nowrap",
              "&::-webkit-scrollbar": { display: "none" },
              scrollSnapType: { xs: "x mandatory", md: "none" },
              scrollPaddingInline: { xs: "12px", md: "0px" },
            }}
          >
            {visibleDates.map((date) => {
              const day = dayjs(date);
              const { outputs, dayType, trainingCount } = getDayData(date);
              const isSelected = selectedDate === date;
              const isTraining = dayType !== "rest";
              const kcal = outputs?.kcalObjectiveDay;
              const kcalLabel = kcal !== undefined ? formatInt(kcal) : null;
              const trainingLabel =
                dayType === "training_type_2"
                  ? "Tipo 2"
                  : dayType === "training_type_1"
                    ? "Tipo 1"
                    : trainingCount > 1
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
                    borderRadius: isClientMobile ? 14 : 3,
                    px: isClientMobile ? 0.45 : 1,
                    py: isClientMobile ? 0.55 : 0.5,
                    scrollSnapAlign: isClientMobile ? "center" : "start",
                    border: "1px solid",
                    borderColor: isSelected
                      ? "rgba(0, 97, 86, 0.28)"
                      : "transparent",
                    bgcolor: isSelected
                      ? "rgba(0, 97, 86, 0.09)"
                      : "transparent",
                    transition:
                      "background-color 220ms ease, border-color 220ms ease, box-shadow 220ms ease, transform 220ms ease",
                    minWidth: isClientMobile ? 62 : 82,
                    boxShadow: isSelected
                      ? "0 6px 14px rgba(0, 97, 86, 0.12)"
                      : "none",
                    "&:hover": {
                      borderColor: isSelected
                        ? "rgba(0, 97, 86, 0.3)"
                        : "rgba(148, 163, 184, 0.3)",
                      bgcolor: isSelected
                        ? "rgba(0, 97, 86, 0.11)"
                        : "rgba(15, 23, 42, 0.025)",
                    },
                    "&:active": {
                      transform: "translateY(0.5px)",
                    },
                  }}
                  aria-label={`Seleccionar ${day.format("dddd")} ${
                    isTraining ? trainingLabel : "descanso"
                  } ${kcalLabel ?? ""} kcal`}
                >
                  <Stack
                    spacing={isClientMobile ? 0.35 : 0.5}
                    alignItems="center"
                    width="100%"
                  >
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={
                        isClientMobile
                          ? {
                              fontSize: 10,
                              lineHeight: 1,
                              letterSpacing: "0.08em",
                              fontWeight: isSelected ? 700 : 500,
                              color: isSelected
                                ? "#006156"
                                : "rgba(71, 85, 105, 0.78)",
                              transition: "color 220ms ease, font-weight 220ms ease",
                            }
                          : undefined
                      }
                    >
                      {day.format("ddd").toUpperCase()}
                    </Typography>
                    <Box
                      sx={{
                        width: isClientMobile ? 30 : 48,
                        height: isClientMobile ? 30 : 48,
                        borderRadius: "50%",
                        display: "grid",
                        placeItems: "center",
                        bgcolor: isClientMobile
                          ? isSelected
                            ? "rgba(255, 255, 255, 0.98)"
                            : isTraining
                              ? "rgba(102, 179, 154, 0.12)"
                              : "rgba(148, 163, 184, 0.16)"
                          : isTraining
                            ? "transparent"
                            : "grey.300",
                        color: isClientMobile
                          ? isSelected
                            ? "#006156"
                            : isTraining
                              ? "#006156"
                              : "rgba(100, 116, 139, 0.92)"
                          : isTraining
                            ? "primary.main"
                            : "grey.50",
                        border: isClientMobile
                          ? `1.6px solid ${
                              isSelected ? "#006156" : statusColor
                            }`
                          : `2px solid ${statusColor}`,
                        fontWeight: 700,
                        fontSize: isClientMobile ? 11 : 14,
                        boxShadow: isClientMobile
                          ? isSelected
                            ? "0 0 0 2px rgba(102, 179, 154, 0.2)"
                            : "none"
                          : isSelected
                            ? `0 0 0 3px ${statusColor}33`
                            : "0 0 0 1px transparent",
                        transition:
                          "background-color 220ms ease, border-color 220ms ease, box-shadow 220ms ease, color 220ms ease",
                        position: "relative",
                      }}
                      title={`${statusLabel}. P ${remainingPortions.protein.toFixed(
                        0,
                      )}, C ${remainingPortions.carbs.toFixed(
                        0,
                      )}, G ${remainingPortions.fat.toFixed(0)}`}
                    >
                      {circleText}
                      <Box
                        sx={{
                          position: "absolute",
                          top: isClientMobile ? 2.5 : 4,
                          right: isClientMobile ? 2.5 : 4,
                          width: isClientMobile ? 5 : 8,
                          height: isClientMobile ? 5 : 8,
                          borderRadius: "50%",
                          bgcolor: statusColor,
                          opacity: isClientMobile ? 0.9 : 1,
                        }}
                      />
                    </Box>
                    {isClientMobile && (
                      <Box
                        sx={{
                          width: isSelected ? 16 : 8,
                          height: 2.5,
                          borderRadius: 999,
                          bgcolor: isSelected
                            ? "rgba(0, 97, 86, 0.9)"
                            : "rgba(148, 163, 184, 0.48)",
                          opacity: isSelected ? 1 : 0.45,
                          transition:
                            "width 220ms ease, opacity 220ms ease, background-color 220ms ease",
                        }}
                      />
                    )}
                    {!isClientMobile && (
                      <Chip
                        size="small"
                        label={isTraining ? trainingLabel : "Descanso"}
                        color={isTraining ? "primary" : "default"}
                        variant={isTraining ? "outlined" : "filled"}
                      />
                    )}
                    {!isClientMobile && kcalLabel !== null && (
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
                        {distributionSelector
                          ? "Selecciona tu tipo de entrenamiento"
                          : "Resumen nutricional"}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {distributionSelector
                          ? "Elige el reparto de macros para este día"
                          : "Kcal objetivo del día"}
                      </Typography>
                    </Box>
                    {/*
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1}
                      sx={{ width: { xs: "100%", sm: "auto" } }}
                    >
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={handleEditSelectedDay}
                        aria-label="Editar dia"
                        sx={{ width: { xs: "100%", sm: "auto" } }}
                      >
                        Editar dia
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={handleOpenRepeatConfig}
                        aria-label="Repetir configuracion"
                        sx={{ width: { xs: "100%", sm: "auto" } }}
                      >
                        Repetir configuracion
                      </Button>
                    </Stack>
                     */}
                  </Stack>

                  {distributionSelector && (
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={{ xs: 2, md: 3 }}
                    >
                      <div>
                        <MacroDonut
                          protein={selectedOutputs.protein}
                          carbs={selectedOutputs.carbsAdjusted}
                          fats={selectedOutputs.fatsAdjusted}
                          kcal={selectedOutputs.kcalObjectiveDay}
                        />
                      </div>
                      <div style={{ flex: 1, width: "100%" }}>
                        {distributionSelector}
                      </div>
                    </Stack>
                  )}

                  <Divider sx={{ my: 0.5 }} />

                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    alignItems={{ xs: "center", md: "center" }}
                    spacing={{ xs: 2, md: 3 }}
                  >
                    <Stack spacing={1} width="100%">
                      <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                        <Typography variant="body2" color="text.secondary">
                          Consumidas
                        </Typography>
                        <Typography variant="body2" color="text.secondary" fontWeight={700}>
                          {`${currentTotals.kcal.toFixed(0)} / ${formatInt(
                            selectedOutputs.kcalObjectiveDay,
                          )} kcal`}
                        </Typography>
                      </Stack>
                      <Box
                        sx={{
                          display: "grid",
                          gap: 1,
                          gridTemplateColumns: "minmax(0, 1fr)",
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
                                  "protein",
                                )
                              : key === "carbs"
                                ? toMacroPortionValue(
                                    selectedOutputs.carbsAdjusted,
                                    "carbs",
                                  )
                                : toMacroPortionValue(
                                    selectedOutputs.fatsAdjusted,
                                    "fat",
                                  );
                          const usedPortions =
                            key === "protein"
                              ? toMacroPortionValue(usedGrams, "protein")
                              : key === "carbs"
                                ? toMacroPortionValue(usedGrams, "carbs")
                                : toMacroPortionValue(usedGrams, "fat");
                          const remainingRaw = budget - usedPortions;
                          const percent =
                            budget > 0
                              ? Math.min((usedPortions / budget) * 100, 140)
                              : 0;
                          const state = getMacroState(
                            remainingRaw,
                            budget,
                            key,
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
                              <Stack
                                direction="row"
                                justifyContent="space-between"
                                alignItems="baseline"
                              >
                                <Typography
                                  variant="caption"
                                  fontWeight={700}
                                  fontSize={13}
                                >
                                  {label}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" fontSize={13}>
                                  {`${formatInt(totalGrams)} / ${objective.toFixed(0)} g · ${formatInt(
                                    budget,
                                  )} porciones`}
                                </Typography>
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
                              <Stack
                                spacing={0.5}
                                sx={{ mt: 1 }}
                                display="none"
                              >
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
                                    Directo {formatInt(directGrams)} g |
                                    Indirecto {formatInt(indirectGrams)} g
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
                                      opacity: 0.5,
                                    }}
                                  />
                                </Box>
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  Incluye {formatInt(indirectGrams)} g de{" "}
                                  {macroPlural[key]} {macroIndirect[key]}{" "}
                                  provenientes de otros alimentos.
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

        {SHOW_MEALS_V1 && selectedOutputs && (
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
                    onRepeatMeal={handleOpenRepeatMeal}
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

        {/* Comidas del dia v2 */}
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
            <Stack spacing={2.5}>
              {/* Encabezado */}
              <Stack direction="row" spacing={1.5} alignItems="flex-start">
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: 2,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    bgcolor: "primary.main",
                    color: "primary.contrastText",
                  }}
                >
                  <RestaurantMenuRoundedIcon fontSize="small" />
                </Box>
                <Box>
                  <Typography variant="subtitle1" fontWeight={700}>
                    Comidas del día
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Consulta las opciones de recetas preparadas por tu especialista.
                  </Typography>
                </Box>
              </Stack>

              {dayMealPlan ? (
                <Box>
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{ mb: 1.5 }}
                  >
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      fontWeight={700}
                      sx={{
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      Tu día, comida a comida
                    </Typography>
                    {generatedMenu && (
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => setGeneratedAccordionExpanded({})}
                        sx={{
                          borderRadius: 2,
                          textTransform: "none",
                          fontWeight: 700,
                        }}
                      >
                        Contraer todos
                      </Button>
                    )}
                  </Stack>
                  <Box>
                    {dayMealPlan.map((meal, mi) => {
                      const isFirst = mi === 0;
                      const isLast = mi === dayMealPlan.length - 1;
                      const timeHint =
                        MEAL_TIME_HINTS[meal.key] ?? DEFAULT_MEAL_TIME;
                      const macroPills = [
                        {
                          label: "P",
                          value: meal.macros.protein,
                          color: theme.palette.primary.main,
                        },
                        {
                          label: "C",
                          value: meal.macros.carbs,
                          color: theme.palette.success.main,
                        },
                        {
                          label: "G",
                          value: meal.macros.fat,
                          color: theme.palette.warning.main,
                        },
                      ];
                      const generatedMeal =
                        generatedMenu?.meals.find(
                          (item) =>
                            normalizeGeneratedMealName(item.meal) ===
                            normalizeGeneratedMealName(meal.label),
                        ) ?? generatedMenu?.meals[mi];
                      const selectedOptionIndex = selectedGeneratedOptions[mi];
                      const mealKey = meal.key as Meal["key"];
                      const choiceMode = mealChoiceModes[mealKey] ?? "recipes";
                      const visibleGeneratedOptions =
                        generatedMeal && selectedOptionIndex !== undefined
                          ? generatedMeal.options[selectedOptionIndex]
                            ? [
                                {
                                  option: generatedMeal.options[selectedOptionIndex],
                                  optionIndex: selectedOptionIndex,
                                },
                              ]
                            : []
                          : (generatedMeal?.options ?? []).map((option, optionIndex) => ({
                              option,
                              optionIndex,
                            }));
                      return (
                        <Box
                          key={meal.key}
                          sx={{ display: "flex", gap: 1.25 }}
                        >
                          {/* Hora sugerida */}
                          <Box
                            sx={{
                              width: 56,
                              flexShrink: 0,
                              textAlign: "right",
                              pt: 0.85,
                            }}
                          >
                            <Typography
                              variant="body2"
                              fontWeight={800}
                              lineHeight={1.1}
                            >
                              {timeHint.time}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {timeHint.suffix}
                            </Typography>
                          </Box>

                          {/* Riel de la línea de tiempo */}
                          <Box
                            sx={{ position: "relative", width: 16, flexShrink: 0 }}
                          >
                            <Box
                              sx={{
                                position: "absolute",
                                left: "50%",
                                transform: "translateX(-50%)",
                                width: 2,
                                bgcolor: "divider",
                                top: isFirst ? 20 : 0,
                                bottom: isLast
                                  ? "calc(100% - 20px)"
                                  : 0,
                              }}
                            />
                            <Box
                              sx={{
                                position: "absolute",
                                left: "50%",
                                top: 13,
                                transform: "translateX(-50%)",
                                width: 14,
                                height: 14,
                                borderRadius: "50%",
                                bgcolor: "primary.main",
                                boxShadow: (t) =>
                                  `0 0 0 3px ${t.palette.background.paper}`,
                              }}
                            />
                          </Box>

                          {/* Comida */}
                          <Box sx={{ flex: 1, pb: isLast ? 0 : 1 }}>
                            {generatedMeal ? (
                              <Accordion
                                disableGutters
                                elevation={0}
                                expanded={generatedAccordionExpanded[mi] ?? false}
                                onChange={(_, expanded) =>
                                  setGeneratedAccordionExpanded((prev) => ({
                                    ...prev,
                                    [mi]: expanded,
                                  }))
                                }
                                sx={{
                                  borderRadius: 2,
                                  border: "1px solid",
                                  borderColor: "divider",
                                  bgcolor: "background.paper",
                                  overflow: "hidden",
                                  "&::before": { display: "none" },
                                }}
                              >
                                <AccordionSummary
                                  expandIcon={<ExpandMoreRoundedIcon />}
                                  sx={{
                                    minHeight: 50,
                                    px: 1.25,
                                    "& .MuiAccordionSummary-content": {
                                      my: 0.75,
                                      minWidth: 0,
                                    },
                                  }}
                                >
                                  <Stack
                                    direction="row"
                                    alignItems="center"
                                    justifyContent="space-between"
                                    spacing={1}
                                    sx={{ width: "100%", minWidth: 0 }}
                                  >
                                    <Stack spacing={0.35} sx={{ minWidth: 0 }}>
                                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                        <Typography
                                          variant="body2"
                                          fontWeight={800}
                                          noWrap
                                          sx={{ minWidth: 0 }}
                                        >
                                          {meal.label}
                                        </Typography>
                                        {selectedOptionIndex === undefined && (
                                          <Chip
                                            size="small"
                                            label={`${generatedMeal.options.length} opciones`}
                                            sx={{ height: 22, fontWeight: 700 }}
                                          />
                                        )}
                                      </Stack>
                                      <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
                                        {macroPills.map((m) => (
                                          <Box
                                            key={m.label}
                                            sx={{
                                              display: "inline-flex",
                                              alignItems: "baseline",
                                              gap: 0.35,
                                              px: 0.6,
                                              py: 0.15,
                                              borderRadius: 1,
                                              bgcolor: m.color + "1F",
                                              color: m.color,
                                            }}
                                          >
                                            <Typography
                                              variant="caption"
                                              fontWeight={800}
                                              sx={{ fontSize: 11, lineHeight: 1.4 }}
                                            >
                                              {m.label}
                                            </Typography>
                                            <Typography
                                              variant="caption"
                                              fontWeight={700}
                                              sx={{ fontSize: 11, lineHeight: 1.4 }}
                                            >
                                              {formatInt(m.value)}
                                            </Typography>
                                          </Box>
                                        ))}
                                      </Stack>
                                    </Stack>
                                    {selectedOptionIndex !== undefined && (
                                      <CheckCircleRoundedIcon
                                        fontSize="small"
                                        sx={{ color: "success.main", flexShrink: 0, mr: 0.5 }}
                                      />
                                    )}
                                  </Stack>
                                </AccordionSummary>
                                <AccordionDetails sx={{ px: 1.25, pt: 0, pb: 1.25 }}>
                                  <Stack spacing={1.25}>
                                    <ToggleButtonGroup
                                      value={choiceMode}
                                      exclusive
                                      size="small"
                                      fullWidth
                                      onChange={(_, value: "recipes" | "custom" | null) => {
                                        if (!value) return;
                                        if (value === "custom") {
                                          void handleChooseCustomMeal(
                                            mi,
                                            mealKey,
                                            meal.label,
                                          );
                                        } else {
                                          setMealChoiceModes((prev) => ({
                                            ...prev,
                                            [mealKey]: "recipes",
                                          }));
                                        }
                                      }}
                                    >
                                      <ToggleButton value="recipes">
                                        Recetas del especialista
                                      </ToggleButton>
                                      <ToggleButton value="custom">
                                        Crear mi plato
                                      </ToggleButton>
                                    </ToggleButtonGroup>

                                    {choiceMode === "recipes" ? (
                                      <>
                                        {selectedOptionIndex !== undefined && (
                                          <Button
                                            size="small"
                                            variant="text"
                                            onClick={() =>
                                              setSelectedGeneratedOptions((prev) => {
                                                const next = { ...prev };
                                                delete next[mi];
                                                return next;
                                              })
                                            }
                                            sx={{
                                              alignSelf: "flex-start",
                                              textTransform: "none",
                                              fontWeight: 700,
                                            }}
                                          >
                                            Cambiar opción
                                          </Button>
                                        )}
                                        <Box
                                          sx={{
                                            display: "grid",
                                            gap: 1.25,
                                            gridTemplateColumns:
                                              selectedOptionIndex !== undefined
                                                ? "1fr"
                                                : {
                                                    xs: "1fr",
                                                    md: "repeat(3, minmax(0, 1fr))",
                                                  },
                                          }}
                                        >
                                          {visibleGeneratedOptions.map(({ option, optionIndex }) =>
                                            renderGeneratedMealOption(option, mi, optionIndex),
                                          )}
                                        </Box>
                                      </>
                                    ) : (
                                      <MealBuilder
                                        meals={currentMeals}
                                        focusedMealKey={mealKey}
                                        onChange={handleMealsChange}
                                        onSave={(meals) =>
                                          void handleSaveCustomMeal(mi, mealKey, meals)
                                        }
                                        mealTargets={mealTargets}
                                        onError={(msg) => setSnackbar(msg)}
                                        onCloneMeal={handleOpenClone}
                                        onRepeatMeal={handleOpenRepeatMeal}
                                      />
                                    )}
                                  </Stack>
                                </AccordionDetails>
                              </Accordion>
                            ) : (
                              <Stack spacing={1}>
                                <Stack
                                  direction="row"
                                  alignItems="center"
                                  justifyContent="space-between"
                                  spacing={1}
                                  sx={{
                                    borderRadius: 2,
                                    border: "1px solid",
                                    borderColor: "divider",
                                    bgcolor: "background.paper",
                                    px: 1.25,
                                    py: 0.85,
                                  }}
                                >
                                  <Typography
                                    variant="body2"
                                    fontWeight={800}
                                    noWrap
                                    sx={{ minWidth: 0 }}
                                  >
                                    {meal.label}
                                  </Typography>
                                  <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                                  {macroPills.map((m) => (
                                    <Box
                                      key={m.label}
                                      sx={{
                                        display: "inline-flex",
                                        alignItems: "baseline",
                                        gap: 0.35,
                                        px: 0.6,
                                        py: 0.15,
                                        borderRadius: 1,
                                        bgcolor: m.color + "1F",
                                        color: m.color,
                                      }}
                                    >
                                      <Typography
                                        variant="caption"
                                        fontWeight={800}
                                        sx={{ fontSize: 11, lineHeight: 1.4 }}
                                      >
                                        {m.label}
                                      </Typography>
                                      <Typography
                                        variant="caption"
                                        fontWeight={700}
                                        sx={{ fontSize: 11, lineHeight: 1.4 }}
                                      >
                                        {formatInt(m.value)}
                                      </Typography>
                                    </Box>
                                  ))}
                                  </Stack>
                                </Stack>
                                <MealBuilder
                                  meals={currentMeals}
                                  focusedMealKey={mealKey}
                                  onChange={handleMealsChange}
                                  onSave={(meals) =>
                                    void handleSaveCustomMeal(mi, mealKey, meals)
                                  }
                                  mealTargets={mealTargets}
                                  onError={(msg) => setSnackbar(msg)}
                                  onCloneMeal={handleOpenClone}
                                  onRepeatMeal={handleOpenRepeatMeal}
                                />
                              </Stack>
                            )}
                          </Box>
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              ) : (
                <Alert severity="info" sx={{ borderRadius: 2 }}>
                  Tu especialista aún no ha configurado el reparto de porciones
                  para esta distribución de macros.
                </Alert>
              )}

              {!generatedMenu && dayMealPlan && (
                <Alert severity="info" sx={{ borderRadius: 2 }}>
                  Tu especialista aún no ha publicado opciones de recetas para esta distribución.
                </Alert>
              )}

              {generatedMenu && (
                <Stack spacing={0}>
                  {/* 
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1}
                    alignItems={{ xs: "stretch", sm: "center" }}
                    justifyContent="space-between"
                  >
                    <Stack spacing={0.5}>
                      <Typography variant="subtitle2" fontWeight={800}>
                        Seleccion automatica
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Toca una opcion en cada horario. Cada seleccion se guarda automaticamente.
                      </Typography>
                    </Stack>
                  </Stack>
                  */}
                  {false && generatedMenu?.meals.map((meal, idx) => (
                    <Stack key={`${meal.meal}-${idx}`} spacing={0}>
                      <Stack
                        direction="row"
                        alignItems="center"
                        spacing={1}
                        flexWrap="wrap"
                      >
                        <Typography variant="body2" fontWeight={800}>
                          {meal.meal}
                        </Typography>
                        <Chip
                          size="small"
                          label={`${meal.options.length} ${
                            meal.options.length === 1 ? "opción" : "opciones"
                          }`}
                          sx={{ height: 22, fontWeight: 600 }}
                        />
                      </Stack>
                      <Box
                        sx={{
                          display: "grid",
                          gap: 1.25,
                          gridTemplateColumns: {
                            xs: "1fr",
                            md: "repeat(3, minmax(0, 1fr))",
                          },
                        }}
                      >
                        {meal.options.map((opt, oi) => {
                          const selected = (selectedGeneratedOptions[idx] ?? 0) === oi;
                          return (
                          <Stack
                            key={`${opt.name}-${oi}`}
                            spacing={1}
                            role="button"
                            tabIndex={0}
                            onClick={() =>
                              setSelectedGeneratedOptions((prev) => ({
                                ...prev,
                                [idx]: oi,
                              }))
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setSelectedGeneratedOptions((prev) => ({
                                  ...prev,
                                  [idx]: oi,
                                }));
                              }
                            }}
                            sx={{
                              p: 1.5,
                              borderRadius: 2.5,
                              border: "1px solid",
                              borderColor: selected ? "primary.main" : "divider",
                              bgcolor: selected ? "primary.50" : "background.paper",
                              cursor: "pointer",
                              transition:
                                "border-color 160ms ease, box-shadow 160ms ease",
                              "&:hover": {
                                borderColor: "primary.main",
                                boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
                              },
                            }}
                          >
                            <Box>
                              <Typography
                                variant="caption"
                                color="primary.main"
                                fontWeight={700}
                                sx={{
                                  textTransform: "uppercase",
                                  letterSpacing: 0.4,
                                }}
                              >
                              </Typography>
                              <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                                <Typography variant="body2" fontWeight={700}>
                                  {opt.name}
                                </Typography>
                              </Stack>
                            </Box>

                            <Stack
                              direction="row"
                              sx={{ flexWrap: "wrap", gap: 0.5 }}
                            >
                              <Box
                                sx={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  px: 0.85,
                                  py: 0.25,
                                  borderRadius: 999,
                                  bgcolor: "grey.100",
                                  fontWeight: 700,
                                  fontSize: 12,
                                }}
                              >
                                {formatInt(opt.totals.kcal)} kcal
                              </Box>
                              {[
                                {
                                  label: "P",
                                  value: opt.totals.protein,
                                  color: theme.palette.primary.main,
                                },
                                {
                                  label: "C",
                                  value: opt.totals.carbs,
                                  color: theme.palette.success.main,
                                },
                                {
                                  label: "G",
                                  value: opt.totals.fat,
                                  color: theme.palette.warning.main,
                                },
                              ].map((m) => (
                                <Box
                                  key={m.label}
                                  sx={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 0.5,
                                    px: 0.85,
                                    py: 0.25,
                                    borderRadius: 999,
                                    bgcolor: m.color + "1F",
                                    color: m.color,
                                  }}
                                >
                                  <Box
                                    sx={{
                                      width: 6,
                                      height: 6,
                                      borderRadius: "50%",
                                      bgcolor: m.color,
                                    }}
                                  />
                                  <Typography
                                    variant="caption"
                                    fontWeight={700}
                                  >
                                    {m.label} {formatInt(m.value)}
                                  </Typography>
                                </Box>
                              ))}
                            </Stack>

                            <Divider sx={{ my: 0.25 }} />

                            <Stack spacing={0.4}>
                              {opt.ingredients.map((ing, i) => (
                                <Stack
                                  key={`${ing.name}-${i}`}
                                  direction="row"
                                  justifyContent="space-between"
                                  spacing={1}
                                >
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ minWidth: 0 }}
                                  >
                                    {ing.name}
                                  </Typography>
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    fontWeight={600}
                                    sx={{ flexShrink: 0 }}
                                  >
                                    {formatInt(ing.grams)} g
                                  </Typography>
                                </Stack>
                              ))}
                            </Stack>
                          </Stack>
                          );
                        })}
                      </Box>
                    </Stack>
                  ))}
                </Stack>
              )}
            </Stack>
          </Card>
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
                  Objetivo: {cloneTargetSummary.kcal} kcal · P
                  {cloneTargetSummary.protein} · C{cloneTargetSummary.carbs} · G
                  {cloneTargetSummary.fat}
                </Typography>
                {cloneTargetPortions && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ lineHeight: 1.35 }}
                  >
                    Porciones: P {formatPortions(cloneTargetPortions.protein)} ·
                    C {formatPortions(cloneTargetPortions.carbs)} · G{" "}
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
              <Stack
                spacing={1}
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Typography variant="subtitle2" fontWeight={700}>
                  Aun no tienes platos guardados para{" "}
                  {cloneMealTypeLabel || "este tipo"}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Guarda un plato para reutilizarlo rapidamente.
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={handleCloseClone}
                  >
                    Volver
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={handleCloseClone}
                  >
                    Crear un plato
                  </Button>
                </Stack>
              </Stack>
            ) : (
              <Stack spacing={2}>
                {cloneGroupedTemplates.map((group) => (
                  <Stack key={group.dateKey} spacing={1}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      fontWeight={700}
                    >
                      {dayjs(group.dateKey).format("ddd, DD MMM YYYY")}
                    </Typography>
                    <Stack spacing={1}>
                      {group.items.map((item) => {
                        const isSelected = cloneSourceId === item.id;
                        const isExpanded = cloneExpandedId === item.id;
                        const showAll = cloneShowAllId === item.id;
                        const visibleItems = showAll
                          ? item.items
                          : item.items.slice(0, 4);
                        const hasMoreItems = item.items.length > 4;
                        const displayName = getTemplateDisplayName(item);
                        const mealNameLabel =
                          getTemplateMealName(item.name) || displayName;
                        const ingredientNames = item.items
                          .map(
                            (mealItem) => mealItem.nameSnapshot?.trim() ?? "",
                          )
                          .filter((name) => name.length > 0);
                        const previewIngredients = ingredientNames.slice(0, 4);
                        const hiddenIngredientsCount = Math.max(
                          ingredientNames.length - previewIngredients.length,
                          0,
                        );
                        const ingredientPreviewLabel = previewIngredients.length
                          ? `${previewIngredients.join(" · ")}${
                              hiddenIngredientsCount
                                ? ` · +${hiddenIngredientsCount}`
                                : ""
                            }`
                          : "Sin ingredientes";
                        // Prefer persisted template totals. If a legacy template misses totals,
                        // sum ingredient macros inline to avoid changing models or API payloads.
                        const fallbackTotals = item.items.reduce(
                          (acc, mealItem) => ({
                            protein:
                              acc.protein + (mealItem.macros?.protein ?? 0),
                            carbs: acc.carbs + (mealItem.macros?.carbs ?? 0),
                            fat: acc.fat + (mealItem.macros?.fat ?? 0),
                            kcal: acc.kcal + (mealItem.kcal ?? 0),
                          }),
                          { protein: 0, carbs: 0, fat: 0, kcal: 0 },
                        );
                        const templateTotals = {
                          protein:
                            item.totals?.protein ?? fallbackTotals.protein,
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
                              borderColor: isSelected
                                ? "primary.main"
                                : "divider",
                              bgcolor: isSelected
                                ? "primary.main" + "0D"
                                : "transparent",
                            }}
                          >
                            <Stack spacing={1.25}>
                              <Stack
                                direction={{ xs: "column", sm: "row" }}
                                spacing={1}
                                alignItems={{
                                  xs: "flex-start",
                                  sm: "flex-start",
                                }}
                                justifyContent="space-between"
                              >
                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                  <Typography
                                    variant="body2"
                                    fontWeight={700}
                                    sx={{
                                      lineHeight: 1.35,
                                      wordBreak: "break-word",
                                    }}
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
                                <Stack
                                  spacing={0.5}
                                  sx={{ minWidth: 0, flex: 1 }}
                                >
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
                                    sx={{
                                      lineHeight: 1.35,
                                      wordBreak: "break-word",
                                    }}
                                  >
                                    Porciones: P{" "}
                                    {formatPortions(templatePortions.protein)} ·
                                    C {formatPortions(templatePortions.carbs)} ·
                                    G {formatPortions(templatePortions.fat)}
                                  </Typography>
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{
                                      lineHeight: 1.35,
                                      wordBreak: "break-word",
                                    }}
                                  >
                                    Ingredientes: {ingredientPreviewLabel}
                                  </Typography>
                                </Stack>
                                <Stack
                                  direction="row"
                                  spacing={1}
                                  alignItems="center"
                                  justifyContent={{
                                    xs: "space-between",
                                    sm: "flex-end",
                                  }}
                                  sx={{ width: { xs: "100%", sm: "auto" } }}
                                >
                                  <Button
                                    size="small"
                                    variant="text"
                                    onClick={() => {
                                      setCloneExpandedId(
                                        isExpanded ? null : item.id,
                                      );
                                      if (isExpanded) {
                                        setCloneShowAllId(null);
                                      }
                                    }}
                                    sx={{ minHeight: 44, px: 1 }}
                                  >
                                    {isExpanded
                                      ? "Ocultar ingredientes"
                                      : "Ver ingredientes"}
                                  </Button>
                                  <Button
                                    size="small"
                                    variant={
                                      isSelected ? "contained" : "outlined"
                                    }
                                    onClick={() => setCloneSourceId(item.id)}
                                    sx={{ minHeight: 44, minWidth: 108 }}
                                  >
                                    {isSelected
                                      ? "Seleccionado"
                                      : "Seleccionar"}
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
                                    <Typography
                                      variant="caption"
                                      color="text.secondary"
                                    >
                                      Sin alimentos.
                                    </Typography>
                                  )}
                                  {hasMoreItems && (
                                    <Button
                                      size="small"
                                      variant="text"
                                      onClick={() =>
                                        setCloneShowAllId(
                                          showAll ? null : item.id,
                                        )
                                      }
                                      sx={{
                                        alignSelf: "flex-start",
                                        minHeight: 40,
                                      }}
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

      <Dialog
        open={repeatOpen}
        onClose={repeatSaving ? undefined : handleCloseRepeatMeal}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ pb: 1 }}>Repetir en otros dias</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
            {repeatSourceMeal && (
              <Box
                sx={{
                  p: 1.25,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Stack spacing={0.5}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    {repeatSourceMeal.name} · {repeatSourceMeal.items.length}{" "}
                    insumos
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {Math.round(repeatSourceMeal.totals.kcal)} kcal · P{" "}
                    {Math.round(repeatSourceMeal.totals.protein)} · C{" "}
                    {Math.round(repeatSourceMeal.totals.carbs)} · G{" "}
                    {Math.round(repeatSourceMeal.totals.fat)}
                  </Typography>
                  {repeatSourcePortions && (
                    <Typography variant="caption" color="text.secondary">
                      Porciones: P{" "}
                      {formatPortions(repeatSourcePortions.protein)} · C{" "}
                      {formatPortions(repeatSourcePortions.carbs)} · G{" "}
                      {formatPortions(repeatSourcePortions.fat)}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary">
                    Origen:{" "}
                    {repeatSourceDate
                      ? dayjs(repeatSourceDate).format("ddd, DD MMM YYYY")
                      : "-"}
                  </Typography>
                </Stack>
              </Box>
            )}

            <TextField
              select
              size="small"
              label="Modo de aplicacion"
              value={repeatMode}
              onChange={(e) =>
                setRepeatMode(e.target.value as "replace" | "only_if_empty")
              }
              disabled={repeatSaving}
            >
              <MenuItem value="replace">
                Reemplazar la comida en los dias seleccionados
              </MenuItem>
              <MenuItem value="only_if_empty">
                Solo aplicar si esa comida esta vacia
              </MenuItem>
            </TextField>

            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              justifyContent="space-between"
              alignItems={{ xs: "stretch", sm: "center" }}
            >
              <Typography variant="caption" color="text.secondary">
                Solo dias futuros dentro de la duracion del plan.
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="text"
                  disabled={repeatSaving || repeatEligibleDates.length === 0}
                  onClick={() => setRepeatTargetDates(repeatEligibleDates)}
                >
                  Seleccionar todos
                </Button>
                <Button
                  size="small"
                  variant="text"
                  disabled={repeatSaving || repeatTargetDates.length === 0}
                  onClick={() => setRepeatTargetDates([])}
                >
                  Limpiar
                </Button>
              </Stack>
            </Stack>

            <Box
              sx={{
                borderRadius: 2,
                border: "1px solid",
                borderColor: "divider",
                overflow: "hidden",
                maxHeight: 320,
                overflowY: "auto",
              }}
            >
              {repeatEligibleDates.length === 0 ? (
                <Box sx={{ p: 1.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    No hay dias futuros disponibles dentro de este plan.
                  </Typography>
                </Box>
              ) : (
                <Stack spacing={0}>
                  {repeatEligibleDates.map((date, idx) => {
                    const checked = repeatTargetDates.includes(date);
                    return (
                      <ButtonBase
                        key={date}
                        onClick={() => {
                          if (repeatSaving) return;
                          setRepeatTargetDates((prev) =>
                            prev.includes(date)
                              ? prev.filter((item) => item !== date)
                              : [...prev, date],
                          );
                        }}
                        sx={{
                          width: "100%",
                          justifyContent: "flex-start",
                          textAlign: "left",
                          px: 1,
                          py: 0.5,
                          minHeight: 48,
                          borderBottom:
                            idx < repeatEligibleDates.length - 1
                              ? "1px solid"
                              : "none",
                          borderColor: "divider",
                        }}
                      >
                        <Checkbox
                          size="small"
                          checked={checked}
                          disableRipple
                          tabIndex={-1}
                          sx={{ mr: 0.5 }}
                        />
                        <Stack spacing={0} sx={{ minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={600}>
                            {dayjs(date).format("ddd, DD MMM YYYY")}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {date}
                          </Typography>
                        </Stack>
                      </ButtonBase>
                    );
                  })}
                </Stack>
              )}
            </Box>

            <Typography variant="caption" color="text.secondary">
              Seleccionados: {repeatSelectedCount}
            </Typography>
            {repeatSaving && <LinearProgress />}
            {repeatError && (
              <Typography variant="caption" color="error">
                {repeatError}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseRepeatMeal} disabled={repeatSaving}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleConfirmRepeatMeal}
            disabled={repeatApplyDisabled}
          >
            {repeatSaving
              ? "Aplicando..."
              : `Aplicar a ${repeatSelectedCount} dias`}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={repeatConfigOpen}
        onClose={repeatConfigSaving ? undefined : handleCloseRepeatConfig}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ pb: 1 }}>
          Repetir configuracion en otros dias
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
            {repeatConfigSource && (
              <Box
                sx={{
                  p: 1.25,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Stack spacing={0.5}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    {repeatConfigSourceSummary ?? "Configuracion del dia"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Actividad: {repeatConfigActivityLabel}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Tipo de dia:{" "}
                    {repeatConfigSource.dayType === "training_type_2"
                      ? "Entreno tipo 2"
                      : repeatConfigSource.dayType === "training_type_1" || repeatConfigSource.dayType === "training"
                        ? "Entreno tipo 1"
                        : "Descanso"}
                  </Typography>
                  {repeatConfigSource.dayType === "training" && (
                    <Stack spacing={0.25}>
                      <Typography variant="caption" color="text.secondary">
                        Entrenos: {Math.max(1, repeatConfigSourceTrainingCount)}
                      </Typography>
                      {repeatConfigSourceTrainingDetails.length > 0 ? (
                        repeatConfigSourceTrainingDetails.map((item, idx) => (
                          <Typography
                            key={`repeat-training-${idx}`}
                            variant="caption"
                            color="text.secondary"
                          >
                            {idx + 1}. {item.label} · {item.duration}
                            {item.met ? ` · ${item.met}` : ""}
                          </Typography>
                        ))
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          1. Entreno sin tipo definido
                        </Typography>
                      )}
                    </Stack>
                  )}
                  <Typography variant="caption" color="text.secondary">
                    Origen:{" "}
                    {repeatConfigSourceDate
                      ? dayjs(repeatConfigSourceDate).format("ddd, DD MMM YYYY")
                      : "-"}
                  </Typography>
                </Stack>
              </Box>
            )}

            <TextField
              select
              size="small"
              label="Modo de aplicacion"
              value={repeatConfigMode}
              onChange={(e) =>
                setRepeatConfigMode(e.target.value as RepeatMode)
              }
              disabled={repeatConfigSaving}
            >
              <MenuItem value="replace">
                Reemplazar la configuracion de actividad y entreno en los dias
                seleccionados
              </MenuItem>
              <MenuItem value="only_if_empty">
                Solo aplicar si ese dia no tiene configuracion de
                actividad/entreno
              </MenuItem>
            </TextField>

            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              justifyContent="space-between"
              alignItems={{ xs: "stretch", sm: "center" }}
            >
              <Typography variant="caption" color="text.secondary">
                Solo dias futuros dentro de la duracion del plan.
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="text"
                  disabled={
                    repeatConfigSaving || repeatConfigEligibleDates.length === 0
                  }
                  onClick={() =>
                    setRepeatConfigTargetDates(repeatConfigEligibleDates)
                  }
                >
                  Seleccionar todos
                </Button>
                <Button
                  size="small"
                  variant="text"
                  disabled={
                    repeatConfigSaving || repeatConfigTargetDates.length === 0
                  }
                  onClick={() => setRepeatConfigTargetDates([])}
                >
                  Limpiar
                </Button>
              </Stack>
            </Stack>

            <Box
              sx={{
                borderRadius: 2,
                border: "1px solid",
                borderColor: "divider",
                overflow: "hidden",
                maxHeight: 320,
                overflowY: "auto",
              }}
            >
              {repeatConfigEligibleDates.length === 0 ? (
                <Box sx={{ p: 1.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    No hay dias futuros disponibles dentro de este plan.
                  </Typography>
                </Box>
              ) : (
                <Stack spacing={0}>
                  {repeatConfigEligibleDates.map((date, idx) => {
                    const checked = repeatConfigTargetDates.includes(date);
                    return (
                      <ButtonBase
                        key={date}
                        onClick={() => {
                          if (repeatConfigSaving) return;
                          setRepeatConfigTargetDates((prev) =>
                            prev.includes(date)
                              ? prev.filter((item) => item !== date)
                              : [...prev, date],
                          );
                        }}
                        sx={{
                          width: "100%",
                          justifyContent: "flex-start",
                          textAlign: "left",
                          px: 1,
                          py: 0.5,
                          minHeight: 48,
                          borderBottom:
                            idx < repeatConfigEligibleDates.length - 1
                              ? "1px solid"
                              : "none",
                          borderColor: "divider",
                        }}
                      >
                        <Checkbox
                          size="small"
                          checked={checked}
                          disableRipple
                          tabIndex={-1}
                          sx={{ mr: 0.5 }}
                        />
                        <Stack spacing={0} sx={{ minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={600}>
                            {dayjs(date).format("ddd, DD MMM YYYY")}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {date}
                          </Typography>
                        </Stack>
                      </ButtonBase>
                    );
                  })}
                </Stack>
              )}
            </Box>

            <Typography variant="caption" color="text.secondary">
              Seleccionados: {repeatConfigSelectedCount}
            </Typography>
            {repeatConfigSaving && <LinearProgress />}
            {repeatConfigError && (
              <Typography variant="caption" color="error">
                {repeatConfigError}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleCloseRepeatConfig}
            disabled={repeatConfigSaving}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleConfirmRepeatConfig}
            disabled={repeatConfigApplyDisabled}
          >
            {repeatConfigSaving
              ? "Aplicando..."
              : `Aplicar a ${repeatConfigSelectedCount} dias`}
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
