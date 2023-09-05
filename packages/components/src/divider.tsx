import { Divider as MuiDivider, type DividerProps } from '@mui/material';
import React from 'react';

export function Divider(props: DividerProps): JSX.Element {
  return <MuiDivider {...props} />;
}
