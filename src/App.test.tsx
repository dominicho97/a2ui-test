import { render, screen } from '@testing-library/react';

import App from '@/App';

describe('App', () => {
  it('renders the workspace layout', () => {
    render(<App />);
    expect(screen.getByTestId('app-root')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-panel')).toBeInTheDocument();
    expect(screen.getByTestId('control-panel')).toBeInTheDocument();
  });
});
