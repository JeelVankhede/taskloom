import { createTheme } from '@mui/material/styles';
import {
  breakpoints,
  fontFamily,
  motion,
  palette,
  radius,
  spacingUnit,
  typeScale,
  zIndex,
} from './tokens';

/**
 * The MUI theme: tokens mapped onto MUI, light and dark schemes as CSS variables (switching
 * scheme never re-renders), and component defaults shared by every screen.
 */
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: { light: { palette: palette.light }, dark: { palette: palette.dark } },
  spacing: spacingUnit,
  shape: { borderRadius: radius.md },
  breakpoints: { values: breakpoints },
  zIndex,
  transitions: {
    duration: {
      shortest: motion.duration.short,
      shorter: motion.duration.short,
      short: motion.duration.standard,
      standard: motion.duration.standard,
      complex: motion.duration.complex,
    },
    easing: { easeInOut: motion.easing, easeOut: motion.easing },
  },
  typography: { fontFamily, ...typeScale },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        // Honor reduced motion for every transition and animation, MUI's and ours.
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': {
            animationDuration: '0.01ms !important',
            animationIterationCount: '1 !important',
            transitionDuration: '0.01ms !important',
          },
        },
      },
    },
    MuiButtonBase: { defaultProps: { disableRipple: true } },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: ({ theme }) => ({
          '&.Mui-focusVisible': {
            outline: `2px solid ${theme.vars.palette.primary.main}`,
            outlineOffset: 2,
          },
        }),
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          '&.Mui-focusVisible': {
            outline: `2px solid ${theme.vars.palette.primary.main}`,
            outlineOffset: 2,
          },
        }),
      },
    },
    MuiTextField: { defaultProps: { fullWidth: true, size: 'small' } },
    MuiCard: {
      defaultProps: { variant: 'outlined' },
      styleOverrides: { root: { borderRadius: radius.lg } },
    },
    MuiDialog: { styleOverrides: { paper: { borderRadius: radius.lg } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 500 } } },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'inherit' },
      styleOverrides: {
        root: ({ theme }) => ({ borderBottom: `1px solid ${theme.vars.palette.divider}` }),
      },
    },
    MuiTooltip: { defaultProps: { arrow: true } },
  },
});
