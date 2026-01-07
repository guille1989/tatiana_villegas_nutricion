import {
  Box,
  Button,
  IconButton,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Paper,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import type { Food } from "../types";
import { calcFoodMacrosFromGrams, gramsFromPortions } from "../lib/foods";

type Props = {
  items: Food[];
  isLoading: boolean;
  error?: string | null;
  isDesktop: boolean;
  onAdd: (food: Food) => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  emptyLabel?: string;
};

const IngredientCatalogTable = ({
  items,
  isLoading,
  error,
  isDesktop,
  onAdd,
  hasMore,
  onLoadMore,
  emptyLabel = "No hay ingredientes para esta categoria.",
}: Props) => {
  const formatValue = (value?: number | null) =>
    Number.isFinite(value) ? value!.toFixed(0) : "-";

  const getPortionInfo = (food: Food) => {
    const portionGrams = gramsFromPortions(food, 1);
    if (!portionGrams || !Number.isFinite(portionGrams) || portionGrams <= 0) {
      return null;
    }
    return {
      grams: portionGrams,
      macros: calcFoodMacrosFromGrams(food, portionGrams),
    };
  };

  const formatGrams = (value?: number | null) =>
    Number.isFinite(value) ? `${value!.toFixed(0)} g` : "-";

  const showEmpty = !isLoading && items.length === 0 && !error;
  const skeletonRows = Array.from({ length: 4 }, (_, idx) => (
      <TableRow key={`skeleton-${idx}`}>
        <TableCell colSpan={5} sx={{ py: 1 }}>
        <Skeleton variant="text" width={`${60 + idx * 7}%`} />
      </TableCell>
    </TableRow>
  ));

  return (
    <Stack spacing={1}>
      {error && (
        <Typography variant="caption" color="error">
          {error}
        </Typography>
      )}
      <TableContainer
        component={Paper}
        variant="outlined"
        sx={{ borderRadius: 2, maxHeight: 260, overflowX: "auto" }}
      >
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, width: 100 }}>Nombre</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">
                Gr porcion
              </TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">
                Kcal porcion
              </TableCell>
              <TableCell sx={{ fontWeight: 700, width: 200 }}>Macros porcion</TableCell>
              <TableCell sx={{ width: 10 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((food) => {
              const portionInfo = getPortionInfo(food);
              const portionMacros = portionInfo?.macros;
              return (
                <TableRow key={food.id}>
                  <TableCell sx={{ py: 0.75, width: 100 }}>
                    <Typography variant="body2" fontWeight={600}>
                      {food.name}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ py: 0.75 }}>
                    <Typography variant="caption" color="text.secondary">
                      {formatGrams(portionInfo?.grams)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ py: 0.75 }}>
                    <Typography variant="caption" color="text.secondary">
                      {formatValue(portionMacros?.kcal)}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ py: 0.75, width: 200 }}>
                    <Typography variant="caption" color="text.secondary">
                      P {formatValue(portionMacros?.protein)} | C{" "}
                      {formatValue(portionMacros?.carbs)} | G{" "}
                      {formatValue(portionMacros?.fat)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ py: 0.75, width: 10 }}>
                    {isDesktop ? (
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={() => onAdd(food)}
                      >
                        Anadir
                      </Button>
                    ) : (
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => onAdd(food)}
                        aria-label={`Anadir ${food.name}`}
                      >
                        <AddIcon fontSize="small" />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {isLoading && skeletonRows}
            {showEmpty && (
              <TableRow>
                <TableCell colSpan={5} sx={{ py: 2 }}>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {emptyLabel}
                    </Typography>
                  </Box>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {hasMore && onLoadMore && (
        <Button
          variant="outlined"
          size="small"
          onClick={onLoadMore}
          disabled={isLoading}
        >
          Cargar mas
        </Button>
      )}
    </Stack>
  );
};

export default IngredientCatalogTable;
