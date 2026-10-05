import React from 'react';
import {render,screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {Table,TableHeader,TableHead,TableBody,TableRow,TableCell} from '@/components/ui/table';
test('shared tables expose keyboard scrolling and identify action columns without duplicating content',()=>{
 render(<Table aria-label="Clients"><TableHeader><TableRow><TableHead>Client</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>Sample client</TableCell><TableCell><button>Open client</button></TableCell></TableRow></TableBody></Table>);
 expect(screen.getByRole('region',{name:'Clients'})).toHaveAttribute('tabindex','0');
 expect(screen.getByRole('columnheader',{name:'Actions'})).toHaveAttribute('data-table-actions','true');
 expect(screen.getByRole('columnheader',{name:'Client'})).toHaveAttribute('scope','col');
 expect(screen.getAllByRole('button',{name:'Open client'})).toHaveLength(1);
});
