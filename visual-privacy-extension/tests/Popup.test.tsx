import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Popup from '../src/popup/Popup';

describe('Popup Component UI Tests', () => {
  // Test 10: Popup loads correctly
  it('10. renders Popup UI correctly with privacy header and upload drop zone', () => {
    render(<Popup />);

    // Header checks
    expect(screen.getByText('VISUAL PRIVACY')).toBeInTheDocument();
    expect(
      screen.getByText('Protect sensitive information before it reaches AI.')
    ).toBeInTheDocument();

    // Upload zone checks
    expect(screen.getByTestId('upload-zone')).toBeInTheDocument();
    expect(screen.getByTestId('upload-button')).toBeInTheDocument();
    expect(screen.getByText('or Drag & Drop Image')).toBeInTheDocument();
    expect(
      screen.getByText('Supported: PNG, JPG, WEBP (Max 10MB)')
    ).toBeInTheDocument();

    // Footer security note
    expect(
      screen.getByText('🔒 Local execution context — 0 network egress')
    ).toBeInTheDocument();
  });
});
