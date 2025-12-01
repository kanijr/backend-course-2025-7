require("dotenv").config();
const express = require("express");
const fs = require("fs");
const multer = require("multer");
const path = require("path");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./swagger");
const pool = require("./db");

const HOST = process.env.HOST;
const PORT = process.env.PORT;
const CACHE = process.env.CACHE_DIR;

if (!fs.existsSync(CACHE)) {
  fs.mkdirSync(CACHE, { recursive: true });
}
const upload = multer({ dest: CACHE });

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

const formatItemResponse = (item) => {
  const photoUrl = item.photo ? `/inventory/${item.id}/photo` : null;
  return {
    ...item,
    photo: photoUrl,
  };
};

/**
 * @swagger
 * /register:
 *   post:
 *     summary: Register new inventory item
 *     description: Register a new inventory item with name, description and optional photo
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - inventory_name
 *             properties:
 *               inventory_name:
 *                 type: string
 *                 description: Name of the inventory item (required)
 *               description:
 *                 type: string
 *                 description: Description of the inventory item
 *               photo:
 *                 type: string
 *                 format: binary
 *                 description: Photo file
 *     responses:
 *       200:
 *         description: Item registered successfully
 *       400:
 *         description: Name is required
 */
app.post("/register", upload.single("photo"), async (req, res) => {
  let { inventory_name, description } = req.body;
  if (!inventory_name) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(400).send("Name required");
  }

  if (!description) description = "";

  let photo = null;
  if (req.file) photo = req.file.filename;

  try {
    let id = (
      await pool.query(
        `INSERT INTO inventory (inventory_name, description, photo) VALUES ($1,$2,$3) RETURNING id`,
        [inventory_name, description, photo]
      )
    ).rows[0].id;

    res
      .status(200)
      .json(formatItemResponse({ id, inventory_name, description, photo }));
  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json(err.message);
  }
});

/**
 * @swagger
 * /inventory:
 *   get:
 *     summary: Get all inventory items
 *     description: Retrieve list of all inventory items with photo URLs
 *     responses:
 *       200:
 *         description: List of inventory items
 */
app.get("/inventory", async (req, res) => {
  try {
    const inventories = (await pool.query(`SELECT * FROM inventory;`)).rows;
    res.status(200).json(inventories.map(formatItemResponse));
  } catch (err) {
    res.status(500).json(err.message);
  }
});

/**
 * @swagger
 * /inventory/{id}:
 *   get:
 *     summary: Get inventory item by ID
 *     description: Retrieve specific inventory item by its ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Inventory item ID
 *     responses:
 *       200:
 *         description: Inventory item found
 *       404:
 *         description: Item not found
 */
app.get("/inventory/:id", async (req, res) => {
  const id = req.params.id;

  try {
    const item = (
      await pool.query(`SELECT * FROM inventory WHERE id = $1;`, [id])
    ).rows[0];

    if (item) {
      res.status(200).json(formatItemResponse(item));
    } else {
      res.status(404).json("Inventory with this id not found");
    }
  } catch (err) {
    res.status(500).json(err.message);
  }
});

/**
 * @swagger
 * /inventory/{id}:
 *   put:
 *     summary: Update inventory item
 *     description: Update name and/or description of inventory item
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Inventory item ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               inventory_name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Item updated successfully
 *       404:
 *         description: Item not found
 */
app.put("/inventory/:id", async (req, res) => {
  const { inventory_name, description } = req.body;

  const id = req.params.id;

  try {
    const item = (
      await pool.query(`SELECT * FROM inventory WHERE id = $1;`, [id])
    ).rows[0];

    if (!item) {
      return res.status(404).json("Inventory with this id not found");
    }

    item.inventory_name = inventory_name ?? item.inventory_name;
    item.description = description ?? item.description;

    await pool.query(
      `UPDATE inventory SET inventory_name=$1, description=$2 WHERE id = $3;`,
      [item.inventory_name, item.description, id]
    );

    res.status(200).json(formatItemResponse(item));
  } catch (err) {
    res.status(500).json(err.message);
  }
});

/**
 * @swagger
 * /inventory/{id}/photo:
 *   get:
 *     summary: Get inventory item photo
 *     description: Retrieve photo of specific inventory item
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Inventory item ID
 *     responses:
 *       200:
 *         description: Photo file
 *         content:
 *           image/jpeg:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Item or photo not found
 */
app.get("/inventory/:id/photo", async (req, res) => {
  const id = req.params.id;

  try {
    const item = (
      await pool.query(`SELECT * FROM inventory WHERE id = $1;`, [id])
    ).rows[0];

    if (!item) {
      return res.status(404).json("Inventory with this id not found");
    } else if (item.photo === null) {
      return res.status(404).json("Inventory has no photo");
    }

    const photoPath = path.join(CACHE, item.photo);

    if (!fs.existsSync(photoPath)) {
      return res.status(404).send("Photo not found");
    }

    res.setHeader("Content-Type", "image/jpeg");
    res.sendFile(photoPath, { root: __dirname });
  } catch (err) {
    res.status(500).json(err.message);
  }
});

/**
 * @swagger
 * /inventory/{id}/photo:
 *   put:
 *     summary: Update inventory item photo
 *     description: Upload new photo for inventory item
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Inventory item ID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *                 description: New photo file
 *     responses:
 *       200:
 *         description: Photo updated successfully
 *       404:
 *         description: Item not found
 */
app.put("/inventory/:id/photo", upload.single("photo"), async (req, res) => {
  const id = req.params.id;

  try {
    const item = (
      await pool.query(`SELECT * FROM inventory WHERE id = $1;`, [id])
    ).rows[0];

    if (!item) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json("Inventory with this id not found");
    }

    if (item.photo) {
      const oldPhotoPath = path.join(CACHE, item.photo);
      if (fs.existsSync(oldPhotoPath)) {
        fs.unlinkSync(oldPhotoPath);
      }
    }

    item.photo = req.file ? req.file.filename : null;

    await pool.query(`UPDATE inventory SET photo=$1 WHERE id = $2;`, [
      item.photo,
      id,
    ]);

    res.status(200).json(formatItemResponse(item));
  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json(err.message);
  }
});

/**
 * @swagger
 * /inventory/{id}:
 *   delete:
 *     summary: Delete inventory item
 *     description: Remove inventory item from system
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Inventory item ID
 *     responses:
 *       200:
 *         description: Item deleted successfully
 *       404:
 *         description: Item not found
 */
app.delete("/inventory/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const item = (
      await pool.query(`SELECT * FROM inventory WHERE id = $1;`, [id])
    ).rows[0];

    if (!item) {
      return res.status(404).json("Inventory with this id not found");
    }

    if (item.photo) {
      const photoPath = path.join(CACHE, item.photo);
      if (fs.existsSync(photoPath)) {
        fs.unlinkSync(photoPath);
      }
    }
    await pool.query(`DELETE FROM inventory WHERE id = $1;`, [id]);

    res.status(200).json();
  } catch (err) {
    res.status(500).json(err.message);
  }
});

/**
 * @swagger
 * /search:
 *   post:
 *     summary: Search inventory item
 *     description: Search for inventory item by ID with option to include photo link in description
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: integer
 *                 description: Inventory item ID to search
 *               has_photo:
 *                 type: string
 *                 description: Include photo link in description when set 'on'
 *     responses:
 *       200:
 *         description: Item found
 *       404:
 *         description: Item not found
 */
app.post("/search", async (req, res) => {
  const { id, has_photo } = req.body;

  try {
    const item = (
      await pool.query(`SELECT * FROM inventory WHERE id = $1;`, [id])
    ).rows[0];

    if (!item) {
      return res.status(404).json("Inventory with this id not found");
    }
    const { photo, ...responseItem } = formatItemResponse(item);

    if (has_photo === "on") {
      if (photo) {
        responseItem.description += " [Photo: " + photo + " ]";
      } else {
        responseItem.description += " [No photo available]";
      }
    }

    res.status(200).json(responseItem);
  } catch (err) {
    res.status(500).json(err.message);
  }
});

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}/`);
});
