import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import { useEffect, useRef, useState } from "react";
import {
  calcFoodMacrosFromGrams,
  fetchFoodsCatalog,
  gramsFromPortions,
} from "../lib/foods";
import { getMacroState, macroStateColor, type MacroKey } from "../lib/macroStatus";
import type { MacroTargets } from "../lib/meals";
import type { Food, Meal, MealItem } from "../types";
import IngredientCatalogTable from "./IngredientCatalogTable";

type MealTargets = Record<Meal["key"], MacroTargets>;

type Props = {
  meals: Meal[];
  mealTargets: MealTargets;
  onChange: (meals: Meal[]) => void;
  onSave?: (meals: Meal[]) => void;
  onError: (msg: string) => void;
};

type BlockCategory = "protein" | "carb" | "fat";

type FoodGroupFilter =
  | "all"
  | "proteinas"
  | "carbohidratos"
  | "grasas";

const CATEGORY_OPTIONS: {
  value: BlockCategory;
  label: string;
  searchGroup: FoodGroupFilter;
  catalogGroup: FoodGroupFilter;
}[] = [
  { value: "protein", label: "Proteina", searchGroup: "proteinas", catalogGroup: "proteinas" },
  { value: "carb", label: "Carbo", searchGroup: "carbohidratos", catalogGroup: "carbohidratos" },
  { value: "fat", label: "Grasas", searchGroup: "grasas", catalogGroup: "grasas" },
];

const CATALOG_DEBOUNCE_MS = 300;
const CATALOG_LIMIT = 25;

const calcMealTotals = (items: MealItem[]) =>
  items.reduce(
    (acc, item) => ({
      protein: acc.protein + item.macros.protein,
      carbs: acc.carbs + item.macros.carbs,
      fat: acc.fat + item.macros.fat,
      kcal: acc.kcal + item.kcal,
    }),
    { protein: 0, carbs: 0, fat: 0, kcal: 0 }
  );

const cloneItem = (item: MealItem): MealItem => ({
  ...item,
  macros: { ...item.macros },
});

const cloneMeal = (meal: Meal): Meal => ({
  ...meal,
  items: meal.items.map(cloneItem),
  totals: { ...meal.totals },
});

const calcTargetKcal = (targets: MacroTargets) =>
  Math.round(targets.protein * 4 + targets.carbs * 4 + targets.fat * 9);

const formatTargets = (targets: MacroTargets) =>
  `P ${targets.protein.toFixed(0)} C ${targets.carbs.toFixed(0)} G ${targets.fat.toFixed(0)}`;

type MacroGaugeProps = {
  label: string;
  consumedGrams: number;
  targetGrams: number;
  gramsPerPortion: number;
  macroKey: MacroKey;
};

const parseNumberInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numberValue = Number(trimmed);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const MacroGauge = ({
  label,
  consumedGrams,
  targetGrams,
  gramsPerPortion,
  macroKey,
}: MacroGaugeProps) => {
  const theme = useTheme();
  const isMdUp = useMediaQuery(theme.breakpoints.up("md"));
  const isSmUp = useMediaQuery(theme.breakpoints.up("sm"));
  const size = isMdUp ? 110 : isSmUp ? 92 : 80;
  const thickness = isMdUp ? 6 : 5;
  const safeTarget = Number.isFinite(targetGrams) ? targetGrams : 0;
  const safeConsumed = Number.isFinite(consumedGrams) ? consumedGrams : 0;
  const portionScale = gramsPerPortion > 0 ? 1 / gramsPerPortion : null;
  const targetPortions = portionScale ? safeTarget * portionScale : 0;
  const consumedPortions = portionScale ? safeConsumed * portionScale : 0;
  const baseTarget = portionScale ? targetPortions : safeTarget;
  const baseConsumed = portionScale ? consumedPortions : safeConsumed;
  const remaining = baseTarget - baseConsumed;
  const state =
    baseTarget <= 0
      ? baseConsumed > 0
        ? "over"
        : "pending"
      : getMacroState(remaining, baseTarget, macroKey);
  const color = macroStateColor[state];
  const progress =
    baseTarget > 0 ? Math.min((baseConsumed / baseTarget) * 100, 100) : 0;

  const round1 = (value: number) => Math.round(value * 10) / 10;
  const normalizeNegativeZero = (value: number) =>
    Object.is(value, -0) ? 0 : value;
  
  const remainingPortions = normalizeNegativeZero(
    round1(targetPortions - consumedPortions)
  );

  return (
    <Stack
      spacing={0.75}
      alignItems="center"
      sx={{
        p: 1,
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
        width: "100%",
        minWidth: 0,
      }}
    >
      <Typography variant="body2" fontWeight={700}>
        {label}
      </Typography>
      <Box sx={{ position: "relative", width: size, height: size }}>
        <CircularProgress
          variant="determinate"
          value={100}
          size={size}
          thickness={thickness}
          sx={{ color: "grey.200", position: "absolute", left: 0, top: 0 }}
        />
        <CircularProgress
          variant="determinate"
          value={progress}
          size={size}
          thickness={thickness}
          sx={{ color, position: "absolute", left: 0, top: 0 }}
        />
        <Stack
          spacing={0.25}
          alignItems="center"
          justifyContent="center"
          sx={{ position: "absolute", inset: 0 }}
        >
          <Typography variant="caption" fontWeight={700}>
            {consumedPortions.toFixed(1)} / {targetPortions.toFixed(1)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            porciones
          </Typography>
        </Stack>
      </Box>
      <Stack spacing={0.5} alignItems="center">
        <Typography variant="caption" color="text.secondary" textAlign="center">
          Porciones: {consumedPortions.toFixed(1)} / {targetPortions.toFixed(1)}{" "}
          <b>(Restan {remainingPortions.toFixed(1)})</b>
        </Typography>
        {/* 
        <Typography variant="caption" color="text.secondary" textAlign="center">
          Gramos: {safeConsumed.toFixed(1)} / {safeTarget.toFixed(1)} g <b>(Restan{" "}
          {remainingGrams.toFixed(1)} g)</b>
        </Typography>*/}
      </Stack>
    </Stack>
  );
};

const MealBuilder = ({ meals, mealTargets, onChange, onSave, onError }: Props) => {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [activeMealKey, setActiveMealKey] = useState<Meal["key"] | null>(null);
  const [draftMeal, setDraftMeal] = useState<Meal | null>(null);
  const [ingredientsMeal, setIngredientsMeal] = useState<Meal | null>(null);
  const [activeCategory, setActiveCategory] =
    useState<BlockCategory>("protein");
  const [selectedGroup, setSelectedGroup] = useState<FoodGroupFilter>("proteinas");

  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogDebouncedQuery, setCatalogDebouncedQuery] = useState("");
  const [catalogItems, setCatalogItems] = useState<Food[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogOffset, setCatalogOffset] = useState(0);
  const [catalogHasMore, setCatalogHasMore] = useState(false);
  const [catalogAddFood, setCatalogAddFood] = useState<Food | null>(null);
  const [catalogAddOpen, setCatalogAddOpen] = useState(false);
  const [catalogAddPortions, setCatalogAddPortions] = useState<string>("1");
  const [catalogAddError, setCatalogAddError] = useState<string | null>(null);

  const [editingItem, setEditingItem] = useState<{
    index: number;
    item: MealItem;
  } | null>(null);
  const [editAmount, setEditAmount] = useState<string>("");
  const [editMode, setEditMode] = useState<"grams" | "portions">("grams");
  const [editError, setEditError] = useState<string | null>(null);

  const plateRef = useRef<HTMLDivElement | null>(null);

  const updateCategory = (value: BlockCategory) => {
    const config = CATEGORY_OPTIONS.find((cat) => cat.value === value);
    setActiveCategory(value);
    setSelectedGroup(config?.catalogGroup ?? "all");
  };

  useEffect(() => {
    const handle = setTimeout(() => {
      setCatalogDebouncedQuery(catalogQuery.trim());
    }, CATALOG_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [catalogQuery]);

  useEffect(() => {
    if (!builderOpen) return;
    setCatalogItems([]);
    setCatalogHasMore(false);
    setCatalogOffset(0);
  }, [builderOpen, selectedGroup, catalogDebouncedQuery]);

  useEffect(() => {
    if (!builderOpen) return;
    let active = true;
    const controller = new AbortController();
    setCatalogLoading(true);
    setCatalogError(null);
    fetchFoodsCatalog({
      query: catalogDebouncedQuery,
      group: selectedGroup,
      limit: CATALOG_LIMIT,
      offset: catalogOffset,
      signal: controller.signal,
    })
      .then((list) => {
        if (!active) return;
        setCatalogItems((prev) =>
          catalogOffset === 0 ? list : [...prev, ...list]
        );
        setCatalogHasMore(list.length === CATALOG_LIMIT);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setCatalogError("No se pudo cargar el catalogo.");
        setCatalogHasMore(false);
        if (catalogOffset === 0) {
          setCatalogItems([]);
        }
      })
      .finally(() => {
        if (active) setCatalogLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [builderOpen, catalogDebouncedQuery, selectedGroup, catalogOffset]);

  const resetCatalog = (resetQuery = false) => {
    setCatalogItems([]);
    setCatalogError(null);
    setCatalogHasMore(false);
    setCatalogLoading(false);
    setCatalogOffset(0);
    if (resetQuery) {
      setCatalogQuery("");
      setCatalogDebouncedQuery("");
    }
  };

  const handleOpenBuilder = (mealKey: Meal["key"]) => {
    const meal = meals.find((item) => item.key === mealKey);
    if (!meal) return;
    setActiveMealKey(mealKey);
    setDraftMeal(cloneMeal(meal));
    setBuilderOpen(true);
    updateCategory("protein");
    resetCatalog(true);
  };

  const handleCloseBuilder = () => {
    setBuilderOpen(false);
    setActiveMealKey(null);
    setDraftMeal(null);
    setEditingItem(null);
    setEditError(null);
    resetCatalog(true);
    setCatalogAddFood(null);
    setCatalogAddOpen(false);
    setCatalogAddPortions("1");
    setCatalogAddError(null);
  };

  const handleConfirmBuilder = () => {
    if (!draftMeal) return;
    const nextMeals = meals.map((meal) =>
      meal.key === draftMeal.key ? draftMeal : meal
    );
    onChange(nextMeals);
    onSave?.(nextMeals);
    handleCloseBuilder();
  };

  const handleOpenIngredients = (meal: Meal) => {
    setIngredientsMeal(meal);
  };

  const handleCloseIngredients = () => {
    setIngredientsMeal(null);
  };

  const addFoodToDraft = (
    food: Food,
    usedMode: "grams" | "portions",
    usedAmount: number,
    options?: { allowFallback?: boolean }
  ) => {
    if (!draftMeal) return false;
    let nextAmount = usedAmount;
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
      if (!options?.allowFallback) {
        onError("Cantidad invalida");
        return false;
      }
      nextAmount = usedMode === "grams" ? 100 : 1;
    }
    let grams = usedMode === "grams" ? nextAmount : 0;
    if (usedMode === "portions") {
      const g = gramsFromPortions(food, nextAmount);
      if (g === null) {
        onError("No se puede calcular porciones para este alimento");
        return false;
      }
      grams = g;
    }
    if (!Number.isFinite(grams) || grams <= 0) {
      onError("Cantidad invalida");
      return false;
    }

    const macros = calcFoodMacrosFromGrams(food, grams);
    const newItem: MealItem = {
      foodId: food.id,
      nameSnapshot: food.name,
      grams,
      amount: nextAmount,
      mode: usedMode,
      macros: { protein: macros.protein, carbs: macros.carbs, fat: macros.fat },
      kcal: macros.kcal,
    };

    const nextItems = [...draftMeal.items, newItem];
    setDraftMeal({
      ...draftMeal,
      items: nextItems,
      totals: calcMealTotals(nextItems),
    });
    return true;
  };

  const handleRequestAddFromCatalog = (food: Food) => {
    setCatalogAddFood(food);
    setCatalogAddPortions("1");
    setCatalogAddError(null);
    setCatalogAddOpen(true);
  };

  const handleCloseCatalogAdd = () => {
    setCatalogAddOpen(false);
    setCatalogAddFood(null);
    setCatalogAddError(null);
  };

  const handleConfirmCatalogAdd = () => {
    if (!catalogAddFood) return;
    const portions = parseNumberInput(catalogAddPortions);
    if (!portions || portions <= 0) {
      setCatalogAddError("Cantidad invalida");
      return;
    }
    const added = addFoodToDraft(catalogAddFood, "portions", portions);
    if (added) {
      handleCloseCatalogAdd();
      plateRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleRemoveItem = (idx: number) => {
    if (!draftMeal) return;
    const nextItems = draftMeal.items.filter((_, i) => i !== idx);
    setDraftMeal({
      ...draftMeal,
      items: nextItems,
      totals: calcMealTotals(nextItems),
    });
  };

  const resolveItemMode = (item: MealItem): "grams" | "portions" => {
    if (item.mode === "portions" && item.amount && item.amount > 0) {
      return "portions";
    }
    return "grams";
  };

  const handleOpenEdit = (index: number, item: MealItem) => {
    const nextMode = resolveItemMode(item);
    const nextAmount = nextMode === "grams" ? item.grams : item.amount ?? 0;
    setEditMode(nextMode);
    setEditAmount(Number.isFinite(nextAmount) ? String(nextAmount) : "");
    setEditError(null);
    setEditingItem({ index, item });
  };

  const handleCloseEdit = () => {
    setEditingItem(null);
    setEditError(null);
  };

  const handleEditSave = () => {
    if (!editingItem || !draftMeal) return;
    const nextAmount = parseNumberInput(editAmount);
    if (!nextAmount || nextAmount <= 0) {
      setEditError("Cantidad invalida");
      return;
    }
    const currentItem = editingItem.item;
    let newGrams = nextAmount;
    if (editMode === "portions") {
      const baseAmount = currentItem.amount ?? 0;
      if (baseAmount <= 0) {
        setEditError("No se puede recalcular porciones para este alimento");
        return;
      }
      const gramsPerPortion = currentItem.grams / baseAmount;
      newGrams = gramsPerPortion * nextAmount;
    }
    if (!Number.isFinite(newGrams) || newGrams <= 0 || currentItem.grams <= 0) {
      setEditError("Cantidad invalida");
      return;
    }

    const ratio = newGrams / currentItem.grams;
    const updatedItem: MealItem = {
      ...currentItem,
      grams: newGrams,
      amount: editMode === "grams" ? newGrams : nextAmount,
      mode: editMode,
      macros: {
        protein: currentItem.macros.protein * ratio,
        carbs: currentItem.macros.carbs * ratio,
        fat: currentItem.macros.fat * ratio,
      },
      kcal: currentItem.kcal * ratio,
    };

    const nextItems = draftMeal.items.map((item, idx) =>
      idx === editingItem.index ? updatedItem : item
    );
    setDraftMeal({
      ...draftMeal,
      items: nextItems,
      totals: calcMealTotals(nextItems),
    });
    setEditingItem(null);
  };

  const editModeLabel = editMode === "grams" ? "Gramos" : "Porciones";
  const editAmountValue = parseNumberInput(editAmount);
  const editAmountInvalid = !editAmountValue || editAmountValue <= 0;
  const catalogAddValue = parseNumberInput(catalogAddPortions);
  const catalogAddInvalid = !catalogAddValue || catalogAddValue <= 0;

  const activeTargets: MacroTargets =
    (activeMealKey && mealTargets[activeMealKey]) ??
    ({ protein: 0, carbs: 0, fat: 0 } as MacroTargets);
  const activeTotals = draftMeal?.totals ?? {
    protein: 0,
    carbs: 0,
    fat: 0,
    kcal: 0,
  };

  const drawerPaperSx = isDesktop
    ? { width: 420 }
    : { height: "90vh", borderTopLeftRadius: 16, borderTopRightRadius: 16 };

  return (
    <>
      <Stack spacing={1.5}>
        {meals.map((meal) => {
          const targets = mealTargets[meal.key] ?? {
            protein: 0,
            carbs: 0,
            fat: 0,
          };
          const targetKcal = calcTargetKcal(targets);
          return (
            <Accordion
              key={meal.key}
              expanded={expanded === meal.key}
              onChange={() => {
                setExpanded(expanded === meal.key ? null : meal.key);
              }}
              sx={{
                borderRadius: 2,
                border: "1px solid",
                borderColor: "divider",
                overflow: "hidden",
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{
                  "& .MuiAccordionSummary-content": {
                    m: 0,
                    alignItems: "center",
                  },
                  px: 1.5,
                  py: 1,
                }}
              >
                <Stack
                  direction="row"
                  spacing={1.5}
                  alignItems="center"
                  flex={1}
                  justifyContent="space-between"
                >
                  <Stack spacing={0.5} sx={{ minWidth: 0 }}>
                    <Typography variant="body1" fontWeight={700}>
                      {meal.name}
                    </Typography>
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      flexWrap="wrap"
                    >
                      <Typography variant="caption" color="text.secondary">
                        Objetivo {targetKcal} kcal
                      </Typography>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Typography variant="caption" color="text.secondary">
                          |
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatTargets(targets)}
                        </Typography>
                      </Stack>
                    </Stack>
                  </Stack>
                  <Stack spacing={0.25} alignItems="flex-end">
                    <Typography variant="caption" color="text.secondary">
                      {meal.items.length} items
                    </Typography>
                    <Button
                      size="small"
                      variant="text"
                      onClick={(event) => {
                        event.stopPropagation();
                        event.preventDefault();
                        handleOpenIngredients(meal);
                      }}
                    >
                      Ver ingredientes
                    </Button>
                  </Stack>
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 1.5, pb: 1.5, pt: 0.5 }}>
                <Stack spacing={1.5}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    Macros de la comida
                  </Typography>
                  <Box
                    sx={{
                      display: "grid",
                      gap: 1,
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    }}
                  >
                    <MacroGauge
                      label="Proteina"
                      consumedGrams={meal.totals.protein}
                      targetGrams={targets.protein}
                      gramsPerPortion={10}
                      macroKey="protein"
                    />
                    <MacroGauge
                      label="Carbohidratos"
                      consumedGrams={meal.totals.carbs}
                      targetGrams={targets.carbs}
                      gramsPerPortion={15}
                      macroKey="carbs"
                    />
                    <MacroGauge
                      label="Grasas"
                      consumedGrams={meal.totals.fat}
                      targetGrams={targets.fat}
                      gramsPerPortion={5}
                      macroKey="fat"
                    />
                  </Box>
                  <Button
                    variant="contained"
                    onClick={() => handleOpenBuilder(meal.key)}
                  >
                    Armar plato
                  </Button>
                </Stack>
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Stack>

      <Drawer
        anchor={isDesktop ? "right" : "bottom"}
        open={builderOpen}
        onClose={handleCloseBuilder}
        PaperProps={{ sx: drawerPaperSx }}
      >
        <Stack spacing={2} sx={{ p: 2, height: "100%", overflowY: "auto" }}>
          <Stack direction="row" justifyContent="space-between" spacing={1}>
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>
                {draftMeal?.name ?? "Comida"}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Objetivo {calcTargetKcal(activeTargets)} kcal |{" "}
                {formatTargets(activeTargets)}
              </Typography>
            </Box>
            <IconButton onClick={handleCloseBuilder} aria-label="Cerrar">
              <CloseIcon />
            </IconButton>
          </Stack>

          <Stack spacing={1}>
            <Typography variant="subtitle2" fontWeight={700}>
              Objetivo vs consumido
            </Typography>
            <Box
              sx={{
                display: "grid",
                gap: 1,
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              }}
            >
              <MacroGauge
                label="Proteina"
                consumedGrams={activeTotals.protein}
                targetGrams={activeTargets.protein}
                gramsPerPortion={10}
                macroKey="protein"
              />
              <MacroGauge
                label="Carbohidratos"
                consumedGrams={activeTotals.carbs}
                targetGrams={activeTargets.carbs}
                gramsPerPortion={15}
                macroKey="carbs"
              />
              <MacroGauge
                label="Grasas"
                consumedGrams={activeTotals.fat}
                targetGrams={activeTargets.fat}
                gramsPerPortion={5}
                macroKey="fat"
              />
            </Box>
          </Stack>

          <Divider />

          <Stack spacing={1}>
            <Typography variant="subtitle2" fontWeight={700}>
              Banco de bloques
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              {CATEGORY_OPTIONS.map((cat) => (
                <Button
                  key={cat.value}
                  variant={activeCategory === cat.value ? "contained" : "outlined"}
                  size="small"
                  onClick={() => updateCategory(cat.value)}
                >
                  {cat.label}
                </Button>
              ))}
            </Stack>
          </Stack>

          <Stack spacing={1}>
            <TextField
              size="small"
              placeholder="Buscar alimento..."
              value={catalogQuery}
              onChange={(e) => setCatalogQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            <IngredientCatalogTable
              items={catalogItems}
              isLoading={catalogLoading}
              error={catalogError}
              isDesktop={isDesktop}
              onAdd={handleRequestAddFromCatalog}
              hasMore={catalogHasMore}
              onLoadMore={() => setCatalogOffset((prev) => prev + CATALOG_LIMIT)}
            />
          </Stack>

          <Stack spacing={1} ref={plateRef}>
            <Typography variant="subtitle2" fontWeight={700}>
              Tu plato
            </Typography>
            {draftMeal?.items.map((item, idx) => (
              <Box
                key={`${item.foodId}-${idx}`}
                sx={{
                  p: 1,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  gap={1}
                >
                  <Stack spacing={0.25}>
                    <Typography variant="body2" fontWeight={700}>
                      {item.nameSnapshot}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.grams.toFixed(0)} g | {item.kcal.toFixed(0)} kcal | P{" "}
                      {item.macros.protein.toFixed(0)} C{" "}
                      {item.macros.carbs.toFixed(0)} G{" "}
                      {item.macros.fat.toFixed(0)}
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.5}>
                    <IconButton
                      size="small"
                      onClick={() => handleOpenEdit(idx, item)}
                      aria-label="Editar"
                    >
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleRemoveItem(idx)}
                      aria-label="Eliminar"
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Stack>
              </Box>
            ))}
            {draftMeal && draftMeal.items.length === 0 && (
              <Typography variant="caption" color="text.secondary">
                No hay bloques en esta comida.
              </Typography>
            )}
          </Stack>

          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={handleCloseBuilder}>Cancelar</Button>
            <Button variant="contained" onClick={handleConfirmBuilder}>
              Confirmar plato
            </Button>
          </Stack>
        </Stack>
      </Drawer>

      <Dialog
        open={!!ingredientsMeal}
        onClose={handleCloseIngredients}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          Ingredientes{ingredientsMeal ? ` de ${ingredientsMeal.name}` : ""}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1.25} sx={{ mt: 0.5 }}>
            {ingredientsMeal?.items.length ? (
              ingredientsMeal.items.map((item, idx) => (
                <Box
                  key={`${item.foodId}-${idx}-ingredients`}
                  sx={{
                    p: 1,
                    borderRadius: 2,
                    border: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  <Typography variant="body2" fontWeight={700}>
                    {item.nameSnapshot}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {item.grams.toFixed(0)} g | {item.kcal.toFixed(0)} kcal | P{" "}
                    {item.macros.protein.toFixed(0)} C{" "}
                    {item.macros.carbs.toFixed(0)} G{" "}
                    {item.macros.fat.toFixed(0)}
                  </Typography>
                </Box>
              ))
            ) : (
              <Typography variant="caption" color="text.secondary">
                Sin alimentos.
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseIngredients}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={catalogAddOpen} onClose={handleCloseCatalogAdd} fullWidth maxWidth="xs">
        <DialogTitle>Agregar porciones</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <Typography variant="subtitle2">
              {catalogAddFood?.name ?? ""}
            </Typography>
            <TextField
              size="small"
              type="number"
              label="Porciones"
              value={catalogAddPortions}
              onChange={(e) => {
                setCatalogAddPortions(e.target.value);
                setCatalogAddError(null);
              }}
              error={catalogAddInvalid || !!catalogAddError}
              helperText={
                catalogAddError ??
                (catalogAddInvalid ? "Cantidad invalida" : " ")
              }
              inputProps={{ min: 0, step: 0.25 }}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseCatalogAdd}>Cancelar</Button>
          <Button variant="contained" onClick={handleConfirmCatalogAdd}>
            Agregar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!editingItem} onClose={handleCloseEdit} fullWidth maxWidth="xs">
        <DialogTitle>Editar alimento</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <Typography variant="subtitle2">
              {editingItem?.item.nameSnapshot}
            </Typography>
            <TextField size="small" label="Modo" value={editModeLabel} disabled />
            <TextField
              size="small"
              type="number"
              label={editModeLabel}
              value={editAmount}
              onChange={(e) => {
                setEditAmount(e.target.value);
                setEditError(null);
              }}
              error={editAmountInvalid || !!editError}
              helperText={editError ?? (editAmountInvalid ? "Cantidad invalida" : " ")}
              inputProps={{ min: 0, step: editMode === "grams" ? 10 : 0.25 }}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseEdit}>Cancelar</Button>
          <Button variant="contained" onClick={handleEditSave} disabled={editAmountInvalid}>
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default MealBuilder;
