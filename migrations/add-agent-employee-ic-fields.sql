-- Migration: Add employee IC fields to agent table
-- Description: Add employee_ic_front and employee_ic_back columns to agent table
--              These are for EMPLOYEE identification (agent's own IC), NOT customer IC documents
-- Date: 2026-02-03

-- Add employee IC front column (for agent's own IC)
ALTER TABLE agent ADD COLUMN IF NOT EXISTS employee_ic_front TEXT;

-- Add employee IC back column (for agent's own IC)
ALTER TABLE agent ADD COLUMN IF NOT EXISTS employee_ic_back TEXT;

-- Add comments for clarity
COMMENT ON COLUMN agent.employee_ic_front IS 'Employee IC front - Agent/User own identification card (NOT customer IC)';
COMMENT ON COLUMN agent.employee_ic_back IS 'Employee IC back - Agent/User own identification card (NOT customer IC)';
