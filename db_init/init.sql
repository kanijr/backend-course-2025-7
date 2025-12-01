CREATE TABLE inventory (
    id SERIAL PRIMARY KEY,
    inventory_name TEXT NOT NULL,
    description TEXT,
    photo VARCHAR(255)
);
