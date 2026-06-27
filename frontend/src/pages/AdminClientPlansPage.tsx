import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getPlan, listAdminUserPlans } from "../lib/api";
import {
  applyMacroOverrideToOutputs,
  calculateDayFromBase,
  getMacroKcalBreakdown,
} from "../lib/calc";
import { getDistributionMacroOverride } from "../lib/macroDistributions";
import type {
  Assessment,
  CalculationOutputs,
  DayOverride,
  Plan,
  WizardInputs,
} from "../types";

type PlanDetail = {
  assessment?: Assessment;
  outputs?: CalculationOutputs;
  overrides: DayOverride[];
};

type DayType = "rest" | "training_type_1" | "training_type_2" | "training";

const getPlanMacroOverrideForDate = (
  plan: Plan | null | undefined,
  date: string,
) => {
  const overrides = plan?.macroOverrides ?? [];
  if (overrides.length === 0) return null;
  const filtered = overrides.filter((item) => item.effectiveFrom <= date);
  if (filtered.length === 0) return null;
  return filtered.reduce((latest, item) =>
    item.effectiveFrom > latest.effectiveFrom ? item : latest,
  );
};

const getTrainingType = (
  override?: DayOverride | null,
  baseInputs?: WizardInputs | null,
): WizardInputs["trainingType"] | null => {
  const overrideTraining =
    override?.overrides?.trainings?.find((item) => item?.type)?.type ??
    override?.overrides?.training?.type ??
    null;
  return (overrideTraining ?? baseInputs?.trainingType ?? null) as
    | WizardInputs["trainingType"]
    | null;
};

const getDayMacroOverride = (override?: DayOverride | null) => {
  if (!override?.overrides?.macroOverride) return null;
  return {
    protein: override.overrides.macroOverride.protein,
    carbsAdjusted: override.overrides.macroOverride.carbsAdjusted,
    fatsAdjusted: override.overrides.macroOverride.fatsAdjusted,
  };
};

const applyPlanMacroOverride = (
  outputs: CalculationOutputs | null | undefined,
  plan: Plan | null | undefined,
  date: string,
  dayType: DayType,
  trainingType: WizardInputs["trainingType"] | null,
  goal?: WizardInputs["goal"] | null,
  weight = 0,
  activityDelta = 0,
  dayOverride?: DayOverride | null,
) => {
  if (!outputs) return outputs;
  const dailyOverride = getDayMacroOverride(dayOverride);
  const distributionOverride = getDistributionMacroOverride(
    plan,
    dayOverride,
    dayType,
    weight,
  );
  const planOverride = getPlanMacroOverrideForDate(plan, date);
  const overrideMacros =
    dailyOverride ?? distributionOverride ?? planOverride?.macros ?? null;
  if (!overrideMacros) return outputs;
  if (!goal) return outputs;
  return applyMacroOverrideToOutputs({
    outputs,
    overrideMacros,
    dayType,
    trainingType,
    goal,
    weight,
    activityDelta,
  });
};

const getMacroPercentages = (outputs?: CalculationOutputs | null) => {
  if (!outputs) return null;
  const { proteinKcal, carbsKcal, fatKcal, totalKcal } = getMacroKcalBreakdown({
    protein: outputs.protein,
    carbs: outputs.carbsAdjusted,
    fat: outputs.fatsAdjusted,
  });
  if (totalKcal <= 0) return null;
  return {
    protein: Math.round((proteinKcal / totalKcal) * 100),
    carbs: Math.round((carbsKcal / totalKcal) * 100),
    fat: Math.round((fatKcal / totalKcal) * 100),
  };
};

const MacroDonut = ({ outputs }: { outputs?: CalculationOutputs | null }) => {
  const theme = useTheme();
  const size = 40;
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  if (!outputs) {
    return (
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: "50%",
          border: "1px solid",
          borderColor: "divider",
        }}
      />
    );
  }

  const { proteinKcal, carbsKcal, fatKcal, totalKcal } = getMacroKcalBreakdown({
    protein: outputs.protein,
    carbs: outputs.carbsAdjusted,
    fat: outputs.fatsAdjusted,
  });

  const segments = [
    { val: carbsKcal, color: theme.palette.success.main },
    { val: proteinKcal, color: theme.palette.primary.main },
    { val: fatKcal, color: theme.palette.warning.main },
  ];

  let offset = 0;

  return (
    <Box sx={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={theme.palette.grey[200]}
          strokeWidth={stroke}
        />
        {totalKcal > 0 &&
          segments.map((seg, idx) => {
            const dash = (seg.val / totalKcal) * circumference;
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
          })}
      </svg>
    </Box>
  );
};

const getPlanTitle = (plan: Plan) => plan.title ?? `Plan ${plan.days}`;

const AdminClientPlansPage = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { userId } = useParams<{ userId: string }>();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planDetails, setPlanDetails] = useState<Record<string, PlanDetail>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    if (!userId) {
      setPlans([]);
      setError("Cliente no encontrado");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await listAdminUserPlans(userId);
      setPlans(result);
    } catch (err) {
      setPlans([]);
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar los planes del cliente",
      );
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    let active = true;
    const loadDetails = async () => {
      if (plans.length === 0) {
        setPlanDetails({});
        setDetailsLoading(false);
        return;
      }
      setDetailsLoading(true);
      const results = await Promise.allSettled(
        plans.map((plan) => getPlan(plan.id)),
      );
      if (!active) return;
      const details: Record<string, PlanDetail> = {};
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          details[plans[index].id] = {
            assessment: result.value.assessment,
            outputs: result.value.assessment?.outputs,
            overrides: result.value.overrides ?? [],
          };
        }
      });
      setPlanDetails(details);
      setDetailsLoading(false);
    };

    void loadDetails();
    return () => {
      active = false;
    };
  }, [plans]);

  const sortedPlans = useMemo(
    () =>
      [...plans].sort(
        (a, b) =>
          dayjs(b.startDate).valueOf() - dayjs(a.startDate).valueOf() ||
          dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf(),
      ),
    [plans],
  );

  return (
    <Container maxWidth="md" sx={{ py: { xs: 3, md: 5 } }}>
      <Stack spacing={3}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          alignItems={{ xs: "stretch", sm: "center" }}
        >
          <Button variant="outlined" onClick={() => navigate("/admin")}>
            Volver al admin
          </Button>
          <Typography variant="body2" color="text.secondary">
            Cliente: {userId ?? "--"}
          </Typography>
        </Stack>

        <Card
          elevation={0}
          sx={{
            borderRadius: 4,
            bgcolor: "common.white",
            border: "1px solid",
            borderColor: "divider",
            boxShadow: "0 18px 40px rgba(15, 23, 42, 0.08)",
          }}
        >
          <CardContent sx={{ p: { xs: 2, md: 3 } }}>
            <Stack spacing={2}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
              >
                <Stack spacing={0.5}>
                  <Typography variant="h6" fontWeight={700}>
                    Planes del cliente
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Lista de planes asignados al cliente. Haz click en un plan
                    para ver detalles o editarlo.
                  </Typography>
                </Stack>
              </Stack>

              {loading && (
                <Stack
                  direction="row"
                  spacing={1.25}
                  alignItems="center"
                  sx={{ py: 2 }}
                >
                  <CircularProgress
                    size={18}
                    thickness={5}
                    sx={{ color: "primary.main" }}
                  />
                  <Typography variant="body2" color="text.secondary">
                    Cargando planes...
                  </Typography>
                </Stack>
              )}

              {!loading && error && (
                <Alert
                  severity="warning"
                  action={
                    <Button
                      color="inherit"
                      size="small"
                      onClick={() => void loadPlans()}
                    >
                      Reintentar
                    </Button>
                  }
                >
                  {error}
                </Alert>
              )}

              {!loading && !error && sortedPlans.length === 0 && (
                <Alert severity="info">Este cliente aun no tiene planes.</Alert>
              )}

              {!loading && !error && sortedPlans.length > 0 && (
                <Stack spacing={1.5}>
                  {sortedPlans.map((plan) => {
                    const detail = planDetails[plan.id];
                    const planStartDate = dayjs(plan.startDate);
                    const planEndDate = planStartDate.add(plan.days - 1, "day");
                    const today = dayjs();
                    const displayDate = (
                      today.isBefore(planStartDate, "day")
                        ? planStartDate
                        : today.isAfter(planEndDate, "day")
                          ? planEndDate
                          : today
                    ).format("YYYY-MM-DD");
                    const baseInputs = detail?.assessment?.inputs ?? null;
                    const baseDayType =
                      detail?.assessment?.inputs?.dayType ?? null;
                    const displayOverride = detail?.overrides?.find(
                      (item) => item.date === displayDate,
                    );
                    const displayTrainingType = getTrainingType(
                      displayOverride,
                      baseInputs,
                    );

                    let activityDelta = 0;
                    if (
                      baseInputs &&
                      displayOverride?.overrides?.activityLevel !== undefined &&
                      displayOverride?.overrides?.activityLevel !== null
                    ) {
                      try {
                        const baseOverrides = {
                          ...displayOverride.overrides,
                          activityLevel: undefined,
                        };
                        const baseOutputs = calculateDayFromBase(
                          baseInputs,
                          baseOverrides,
                        );
                        const activityOutputs = calculateDayFromBase(
                          baseInputs,
                          displayOverride.overrides,
                        );
                        activityDelta =
                          (activityOutputs.kcalObjectiveDay ?? 0) -
                          (baseOutputs.kcalObjectiveDay ?? 0);
                      } catch {
                        activityDelta = 0;
                      }
                    }

                    const adjustedOutputs = applyPlanMacroOverride(
                      detail?.outputs,
                      plan,
                      displayDate,
                      baseDayType ?? "rest",
                      displayTrainingType,
                      baseInputs?.goal ?? null,
                      baseInputs?.weight ?? 0,
                      activityDelta,
                      displayOverride,
                    );
                    const macros = getMacroPercentages(adjustedOutputs);
                    const isActive = !plan.status || plan.status === "active";
                    const statusDot = isActive
                      ? theme.palette.success.main
                      : theme.palette.grey[400];

                    return (
                      <Box
                        key={plan.id}
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          navigate(`/admin/client/${userId}?planId=${plan.id}`)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            navigate(
                              `/admin/client/${userId}?planId=${plan.id}`,
                            );
                          }
                        }}
                        sx={{
                          px: { xs: 1.5, sm: 2.25 },
                          py: { xs: 1.5, sm: 2 },
                          borderRadius: 2.5,
                          border: "1px solid",
                          borderColor: "divider",
                          bgcolor: isActive
                            ? alpha(theme.palette.success.main, 0.08)
                            : alpha(theme.palette.primary.main, 0.04),
                          cursor: "pointer",
                          transition:
                            "transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease",
                          "&:hover": {
                            transform: "translateY(-1px)",
                            borderColor: theme.palette.primary.main,
                            boxShadow: "0 12px 28px rgba(37, 99, 235, 0.12)",
                          },
                        }}
                      >
                        <Stack spacing={1.4}>
                          <Stack
                            direction="row"
                            spacing={1.25}
                            alignItems="center"
                          >
                            <Box
                              sx={{
                                width: 10,
                                height: 10,
                                borderRadius: "50%",
                                bgcolor: statusDot,
                                flexShrink: 0,
                              }}
                            />
                            <Typography
                              sx={{
                                fontSize: { xs: 16, sm: 18 },
                                lineHeight: 1.2,
                                fontWeight: 600,
                                letterSpacing: 0.2,
                              }}
                            >
                              {getPlanTitle(plan)}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              - {dayjs(plan.startDate).format("DD/MM/YYYY")}
                            </Typography>
                          </Stack>

                          <Stack
                            direction="row"
                            alignItems="center"
                            justifyContent="space-between"
                            spacing={1.5}
                          >
                            <Stack
                              direction="row"
                              alignItems="center"
                              spacing={1.5}
                            >
                              <MacroDonut outputs={adjustedOutputs} />
                              <Stack
                                direction="row"
                                spacing={1.6}
                                alignItems="center"
                              >
                                <Typography
                                  variant="body2"
                                  sx={{
                                    color: "primary.main",
                                    fontWeight: 700,
                                  }}
                                >
                                  P {macros?.protein ?? "--"}%
                                </Typography>
                                <Typography
                                  variant="body2"
                                  sx={{
                                    color: "success.main",
                                    fontWeight: 700,
                                  }}
                                >
                                  C {macros?.carbs ?? "--"}%
                                </Typography>

                                <Typography
                                  variant="body2"
                                  sx={{
                                    color: "warning.main",
                                    fontWeight: 700,
                                  }}
                                >
                                  G {macros?.fat ?? "--"}%
                                </Typography>
                              </Stack>
                            </Stack>
                            <Stack
                              direction="row"
                              spacing={0.5}
                              alignItems="baseline"
                            >
                              <Typography
                                sx={{
                                  color: "text.primary",
                                  fontWeight: 700,
                                  fontSize: 24,
                                }}
                              >
                                {adjustedOutputs?.kcalObjectiveDay !== undefined
                                  ? Math.round(adjustedOutputs.kcalObjectiveDay)
                                  : "--"}
                              </Typography>
                              <Typography
                                variant="caption"
                                sx={{
                                  color: "text.secondary",
                                  letterSpacing: 0.6,
                                }}
                              >
                                KCAL
                              </Typography>
                            </Stack>
                          </Stack>

                          <Stack direction="row" justifyContent="flex-end">
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={(event) => {
                                event.stopPropagation();
                                navigate(`/plans/${plan.id}`);
                              }}
                              onKeyDown={(event) => event.stopPropagation()}
                            >
                              Editar platos
                            </Button>
                          </Stack>
                        </Stack>
                      </Box>
                    );
                  })}
                </Stack>
              )}
              {detailsLoading && !loading && sortedPlans.length > 0 && (
                <Typography variant="caption" color="text.secondary">
                  Calculando macros de los planes...
                </Typography>
              )}
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
};

export default AdminClientPlansPage;
