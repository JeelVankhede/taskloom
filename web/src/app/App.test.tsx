import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '../design-system';
import { App } from './App';

describe('App', () => {
  it('renders the app heading', () => {
    // Arrange and act
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );

    // Assert
    expect(screen.getByRole('heading', { name: 'Taskloom' })).toBeInTheDocument();
  });
});
