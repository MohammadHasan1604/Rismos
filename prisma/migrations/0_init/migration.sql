-- CreateTable
CREATE TABLE `stores` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(16) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `city` VARCHAR(64) NOT NULL,
    `address` VARCHAR(255) NOT NULL,
    `timezone` VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    `owner_name` VARCHAR(128) NULL,
    `manager_name` VARCHAR(128) NULL,
    `phone` VARCHAR(32) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'Active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `stores_code_key`(`code`),
    INDEX `stores_status_idx`(`status`),
    INDEX `stores_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(128) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `phone` VARCHAR(32) NULL,
    `role` VARCHAR(32) NOT NULL DEFAULT 'Sales Manager',
    `security_level` INTEGER NOT NULL DEFAULT 40,
    `store_scope` VARCHAR(64) NOT NULL DEFAULT 'BLR',
    `status` VARCHAR(16) NOT NULL DEFAULT 'Active',
    `must_change_password` BOOLEAN NOT NULL DEFAULT false,
    `avatar_url` LONGTEXT NULL,
    `last_login` DATETIME(3) NULL,
    `failed_login_attempts` INTEGER NOT NULL DEFAULT 0,
    `locked_until` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_role_idx`(`role`),
    INDEX `users_status_idx`(`status`),
    INDEX `users_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_permission_overrides` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `permission_code` VARCHAR(64) NOT NULL,
    `override_type` VARCHAR(16) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `user_permission_overrides_user_id_idx`(`user_id`),
    INDEX `user_permission_overrides_permission_code_idx`(`permission_code`),
    UNIQUE INDEX `user_permission_overrides_user_id_permission_code_key`(`user_id`, `permission_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `token_hash` VARCHAR(128) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `ip_address` VARCHAR(64) NULL,
    `user_agent` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_seen_at` DATETIME(3) NULL,

    UNIQUE INDEX `user_sessions_token_hash_key`(`token_hash`),
    INDEX `user_sessions_user_id_idx`(`user_id`),
    INDEX `user_sessions_expires_at_idx`(`expires_at`),
    INDEX `user_sessions_revoked_at_idx`(`revoked_at`),
    INDEX `user_sessions_last_seen_at_idx`(`last_seen_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_store_assignments` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `store_code` VARCHAR(16) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_store_assignments_store_code_idx`(`store_code`),
    UNIQUE INDEX `user_store_assignments_user_id_store_code_key`(`user_id`, `store_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `slug` VARCHAR(128) NOT NULL,
    `parent_category_id` VARCHAR(191) NULL,
    `category_type` VARCHAR(64) NOT NULL DEFAULT 'Product',
    `description` VARCHAR(255) NULL,
    `image_url` LONGTEXT NULL,
    `icon` VARCHAR(64) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'Active',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_by` VARCHAR(128) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `categories_slug_key`(`slug`),
    INDEX `categories_parent_category_id_idx`(`parent_category_id`),
    INDEX `categories_category_type_idx`(`category_type`),
    INDEX `categories_status_idx`(`status`),
    INDEX `categories_sort_order_idx`(`sort_order`),
    INDEX `categories_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `category_types` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(64) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `description` VARCHAR(255) NULL,
    `color` VARCHAR(32) NULL DEFAULT 'primary',
    `is_system` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `category_types_name_key`(`name`),
    UNIQUE INDEX `category_types_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` VARCHAR(191) NOT NULL,
    `sku` VARCHAR(64) NOT NULL,
    `barcode` VARCHAR(64) NULL,
    `name` VARCHAR(160) NOT NULL,
    `brand` VARCHAR(64) NULL,
    `model` VARCHAR(64) NULL,
    `category` VARCHAR(64) NOT NULL,
    `subcategory` VARCHAR(64) NULL,
    `base_cost_price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `base_selling_price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `mrp` DECIMAL(12, 2) NULL,
    `gst_rate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `warranty_months` INTEGER NOT NULL DEFAULT 0,
    `image_url` LONGTEXT NULL,
    `description` TEXT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `products_sku_key`(`sku`),
    INDEX `products_category_idx`(`category`),
    INDEX `products_brand_idx`(`brand`),
    INDEX `products_status_idx`(`status`),
    INDEX `products_created_at_idx`(`created_at`),
    INDEX `products_name_idx`(`name`),
    INDEX `products_barcode_idx`(`barcode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory` (
    `id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `store_code` VARCHAR(16) NOT NULL,
    `qty_on_hand` INTEGER NOT NULL DEFAULT 0,
    `qty_reserved` INTEGER NOT NULL DEFAULT 0,
    `reorder_pt` INTEGER NOT NULL DEFAULT 5,
    `max_stock` INTEGER NOT NULL DEFAULT 50,
    `shelf_loc` VARCHAR(32) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `inventory_store_code_idx`(`store_code`),
    INDEX `inventory_qty_on_hand_idx`(`qty_on_hand`),
    UNIQUE INDEX `inventory_product_id_store_code_key`(`product_id`, `store_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_ledger` (
    `id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `store_code` VARCHAR(16) NOT NULL,
    `ref_no` VARCHAR(64) NOT NULL,
    `type` VARCHAR(32) NOT NULL,
    `qty_change` INTEGER NOT NULL,
    `cost_per_unit` DECIMAL(12, 2) NOT NULL,
    `selling_price_per_unit` DECIMAL(12, 2) NULL,
    `balance_after` INTEGER NOT NULL,
    `notes` VARCHAR(255) NULL,
    `created_by` VARCHAR(128) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `inventory_ledger_store_code_idx`(`store_code`),
    INDEX `inventory_ledger_ref_no_idx`(`ref_no`),
    INDEX `inventory_ledger_product_id_idx`(`product_id`),
    INDEX `inventory_ledger_created_at_idx`(`created_at`),
    INDEX `inventory_ledger_type_idx`(`type`),
    INDEX `inventory_ledger_store_code_created_at_idx`(`store_code`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_transfers` (
    `id` VARCHAR(191) NOT NULL,
    `transfer_no` VARCHAR(64) NOT NULL,
    `source_store` VARCHAR(16) NOT NULL,
    `dest_store` VARCHAR(16) NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'Received',
    `ship_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `receive_date` DATETIME(3) NULL,
    `requested_by` VARCHAR(128) NOT NULL,
    `received_by` VARCHAR(128) NULL,
    `total_units` INTEGER NOT NULL,
    `total_cost` DECIMAL(15, 2) NOT NULL,
    `total_transfer_value` DECIMAL(15, 2) NOT NULL,
    `gross_profit` DECIMAL(15, 2) NOT NULL,
    `notes` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `stock_transfers_transfer_no_key`(`transfer_no`),
    INDEX `stock_transfers_source_store_idx`(`source_store`),
    INDEX `stock_transfers_dest_store_idx`(`dest_store`),
    INDEX `stock_transfers_status_idx`(`status`),
    INDEX `stock_transfers_created_at_idx`(`created_at`),
    INDEX `stock_transfers_ship_date_idx`(`ship_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_transfer_items` (
    `id` VARCHAR(191) NOT NULL,
    `transfer_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `qty` INTEGER NOT NULL,
    `cost_per_unit` DECIMAL(12, 2) NOT NULL,
    `transfer_price_per_unit` DECIMAL(12, 2) NOT NULL,
    `line_total_cost` DECIMAL(12, 2) NOT NULL,
    `line_total_value` DECIMAL(12, 2) NOT NULL,
    `line_profit` DECIMAL(12, 2) NOT NULL,

    INDEX `stock_transfer_items_transfer_id_idx`(`transfer_id`),
    INDEX `stock_transfer_items_product_id_idx`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customers` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `phone` VARCHAR(32) NOT NULL,
    `normalized_phone` VARCHAR(32) NOT NULL,
    `email` VARCHAR(128) NULL,
    `city` VARCHAR(64) NOT NULL DEFAULT 'Bengaluru',
    `address` VARCHAR(255) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'Active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `customers_normalized_phone_idx`(`normalized_phone`),
    INDEX `customers_created_at_idx`(`created_at`),
    INDEX `customers_status_idx`(`status`),
    INDEX `customers_name_idx`(`name`),
    INDEX `customers_phone_idx`(`phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_store_profiles` (
    `id` VARCHAR(191) NOT NULL,
    `customer_id` VARCHAR(191) NOT NULL,
    `store_code` VARCHAR(16) NOT NULL,
    `credit_balance` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `total_spent` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `total_orders` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `customer_store_profiles_store_code_idx`(`store_code`),
    INDEX `customer_store_profiles_customer_id_idx`(`customer_id`),
    UNIQUE INDEX `customer_store_profiles_customer_id_store_code_key`(`customer_id`, `store_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_external_links` (
    `id` VARCHAR(191) NOT NULL,
    `cosko_customer_id` VARCHAR(191) NULL,
    `source_system` VARCHAR(64) NOT NULL DEFAULT 'LEGACY_MYSQL_DB',
    `external_customer_id` VARCHAR(64) NOT NULL,
    `external_customer_name` VARCHAR(128) NOT NULL,
    `normalized_mobile` VARCHAR(32) NOT NULL,
    `link_status` VARCHAR(32) NOT NULL DEFAULT 'AUTO_MATCHED',
    `match_type` VARCHAR(32) NOT NULL DEFAULT 'EXACT_PHONE',
    `verified_by` VARCHAR(128) NULL,
    `verified_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `customer_external_links_normalized_mobile_idx`(`normalized_mobile`),
    INDEX `customer_external_links_external_customer_id_idx`(`external_customer_id`),
    INDEX `customer_external_links_link_status_idx`(`link_status`),
    INDEX `customer_external_links_cosko_customer_id_idx`(`cosko_customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `repair_enquiries` (
    `id` VARCHAR(191) NOT NULL,
    `ticket_no` VARCHAR(32) NOT NULL,
    `customer_id` VARCHAR(191) NULL,
    `customer_name` VARCHAR(128) NOT NULL,
    `customer_phone` VARCHAR(32) NOT NULL,
    `normalized_phone` VARCHAR(32) NOT NULL,
    `device_name` VARCHAR(128) NOT NULL,
    `issue_description` VARCHAR(255) NOT NULL,
    `estimated_cost` DECIMAL(12, 2) NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'Pending Diagnosis',
    `assigned_tech` VARCHAR(128) NULL,
    `store_code` VARCHAR(16) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `repair_enquiries_ticket_no_key`(`ticket_no`),
    INDEX `repair_enquiries_normalized_phone_idx`(`normalized_phone`),
    INDEX `repair_enquiries_customer_id_idx`(`customer_id`),
    INDEX `repair_enquiries_status_idx`(`status`),
    INDEX `repair_enquiries_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vendors` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `contact_person` VARCHAR(128) NOT NULL,
    `email` VARCHAR(128) NOT NULL,
    `phone` VARCHAR(32) NOT NULL,
    `city` VARCHAR(64) NOT NULL,
    `address` VARCHAR(255) NULL,
    `categories` VARCHAR(255) NOT NULL,
    `gstin` VARCHAR(32) NULL DEFAULT '',
    `payment_terms` VARCHAR(32) NOT NULL DEFAULT 'Net 30',
    `lead_time_days` INTEGER NULL,
    `rating` DECIMAL(3, 1) NULL,
    `store_code` VARCHAR(16) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'Active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `vendors_code_key`(`code`),
    INDEX `vendors_status_idx`(`status`),
    INDEX `vendors_created_at_idx`(`created_at`),
    INDEX `vendors_store_code_idx`(`store_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchases` (
    `id` VARCHAR(191) NOT NULL,
    `po_no` VARCHAR(64) NOT NULL,
    `invoice_no` VARCHAR(64) NULL,
    `vendor_id` VARCHAR(191) NOT NULL,
    `store_code` VARCHAR(16) NOT NULL,
    `order_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expected_date` DATETIME(3) NULL,
    `due_date` DATETIME(3) NULL,
    `received_date` DATETIME(3) NULL,
    `subtotal` DECIMAL(15, 2) NULL DEFAULT 0,
    `tax_amount` DECIMAL(15, 2) NULL DEFAULT 0,
    `discount_amount` DECIMAL(15, 2) NULL DEFAULT 0,
    `total_cost` DECIMAL(15, 2) NOT NULL,
    `paid_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `credit_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `status` VARCHAR(32) NOT NULL DEFAULT 'Ordered',
    `payment_status` VARCHAR(32) NOT NULL DEFAULT 'Unpaid',
    `created_by` VARCHAR(128) NOT NULL,
    `notes` VARCHAR(255) NULL,
    `country_code` VARCHAR(8) NOT NULL DEFAULT 'IN',
    `currency_code` VARCHAR(8) NOT NULL DEFAULT 'INR',
    `tax_regime` VARCHAR(32) NOT NULL DEFAULT 'GST',
    `tax_breakdown_json` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `purchases_po_no_key`(`po_no`),
    INDEX `purchases_store_code_idx`(`store_code`),
    INDEX `purchases_vendor_id_idx`(`vendor_id`),
    INDEX `purchases_status_idx`(`status`),
    INDEX `purchases_payment_status_idx`(`payment_status`),
    INDEX `purchases_created_at_idx`(`created_at`),
    INDEX `purchases_store_code_created_at_idx`(`store_code`, `created_at`),
    INDEX `purchases_order_date_idx`(`order_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_payments` (
    `id` VARCHAR(191) NOT NULL,
    `purchase_id` VARCHAR(191) NOT NULL,
    `voucher_no` VARCHAR(64) NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `payment_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `payment_method` VARCHAR(32) NOT NULL DEFAULT 'UPI',
    `reference_no` VARCHAR(64) NULL,
    `receipt_url` LONGTEXT NULL,
    `notes` VARCHAR(255) NULL,
    `recorded_by` VARCHAR(128) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `purchase_payments_purchase_id_idx`(`purchase_id`),
    INDEX `purchase_payments_payment_date_idx`(`payment_date`),
    INDEX `purchase_payments_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `goods_received_notes` (
    `id` VARCHAR(191) NOT NULL,
    `grn_no` VARCHAR(64) NOT NULL,
    `purchase_id` VARCHAR(191) NOT NULL,
    `store_code` VARCHAR(16) NOT NULL,
    `received_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `received_by` VARCHAR(128) NOT NULL,
    `notes` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `goods_received_notes_grn_no_key`(`grn_no`),
    INDEX `goods_received_notes_purchase_id_idx`(`purchase_id`),
    INDEX `goods_received_notes_store_code_idx`(`store_code`),
    INDEX `goods_received_notes_received_date_idx`(`received_date`),
    INDEX `goods_received_notes_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_items` (
    `id` VARCHAR(191) NOT NULL,
    `po_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `qty_ordered` INTEGER NOT NULL,
    `qty_received` INTEGER NOT NULL,
    `unit_cost` DECIMAL(12, 2) NOT NULL,
    `tax_rate` DECIMAL(5, 2) NULL DEFAULT 0,
    `tax_amount` DECIMAL(12, 2) NULL DEFAULT 0,
    `discount` DECIMAL(12, 2) NULL DEFAULT 0,
    `line_total` DECIMAL(12, 2) NOT NULL,

    INDEX `purchase_items_po_id_idx`(`po_id`),
    INDEX `purchase_items_product_id_idx`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales` (
    `id` VARCHAR(191) NOT NULL,
    `order_no` VARCHAR(64) NOT NULL,
    `store_code` VARCHAR(16) NOT NULL,
    `customer_id` VARCHAR(191) NULL,
    `customer_name` VARCHAR(128) NOT NULL,
    `customer_phone` VARCHAR(32) NOT NULL,
    `subtotal` DECIMAL(15, 2) NOT NULL,
    `tax_amount` DECIMAL(15, 2) NOT NULL,
    `discount_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `grand_total` DECIMAL(15, 2) NOT NULL,
    `total_cost` DECIMAL(15, 2) NOT NULL,
    `gross_profit` DECIMAL(15, 2) NOT NULL,
    `payment_method` VARCHAR(32) NOT NULL DEFAULT 'UPI',
    `reference_no` VARCHAR(64) NULL,
    `payment_proof_url` LONGTEXT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'Completed',
    `cashier_name` VARCHAR(128) NOT NULL,
    `photos_json` TEXT NULL,
    `country_code` VARCHAR(8) NOT NULL DEFAULT 'IN',
    `currency_code` VARCHAR(8) NOT NULL DEFAULT 'INR',
    `currency_symbol` VARCHAR(8) NOT NULL DEFAULT 'Ôé╣',
    `tax_regime` VARCHAR(32) NOT NULL DEFAULT 'GST',
    `tax_inclusive` BOOLEAN NOT NULL DEFAULT false,
    `tax_config_version` INTEGER NOT NULL DEFAULT 1,
    `tax_registration_snapshot` VARCHAR(64) NULL,
    `tax_breakdown_json` TEXT NULL,
    `invoice_template_version` INTEGER NOT NULL DEFAULT 1,
    `invoice_snapshot_json` LONGTEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sales_order_no_key`(`order_no`),
    INDEX `sales_store_code_idx`(`store_code`),
    INDEX `sales_order_no_idx`(`order_no`),
    INDEX `sales_created_at_idx`(`created_at`),
    INDEX `sales_store_code_created_at_idx`(`store_code`, `created_at`),
    INDEX `sales_status_idx`(`status`),
    INDEX `sales_customer_id_idx`(`customer_id`),
    INDEX `sales_payment_method_idx`(`payment_method`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sale_items` (
    `id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `product_name` VARCHAR(160) NOT NULL,
    `sku` VARCHAR(64) NOT NULL,
    `qty` INTEGER NOT NULL,
    `unit_price` DECIMAL(12, 2) NOT NULL,
    `unit_cost` DECIMAL(12, 2) NOT NULL,
    `discount_percent` DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    `line_total` DECIMAL(12, 2) NOT NULL,
    `line_profit` DECIMAL(12, 2) NOT NULL,
    `tax_rate` DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    `tax_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `hsn_sac` VARCHAR(32) NULL,

    INDEX `sale_items_order_id_idx`(`order_id`),
    INDEX `sale_items_product_id_idx`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `expenses` (
    `id` VARCHAR(191) NOT NULL,
    `expense_no` VARCHAR(64) NOT NULL,
    `store_code` VARCHAR(16) NOT NULL,
    `category` VARCHAR(64) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `description` VARCHAR(255) NOT NULL,
    `payment_method` VARCHAR(32) NOT NULL DEFAULT 'UPI',
    `reference_no` VARCHAR(64) NULL,
    `receipt_url` LONGTEXT NULL,
    `approved_by` VARCHAR(128) NOT NULL,
    `recorded_by` VARCHAR(128) NULL,
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `expenses_expense_no_key`(`expense_no`),
    INDEX `expenses_store_code_idx`(`store_code`),
    INDEX `expenses_created_at_idx`(`created_at`),
    INDEX `expenses_date_idx`(`date`),
    INDEX `expenses_category_idx`(`category`),
    INDEX `expenses_store_code_date_idx`(`store_code`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `central_expenses` (
    `id` VARCHAR(191) NOT NULL,
    `expense_no` VARCHAR(64) NOT NULL,
    `category` VARCHAR(64) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `description` VARCHAR(255) NOT NULL,
    `payment_method` VARCHAR(32) NOT NULL DEFAULT 'UPI',
    `reference_no` VARCHAR(64) NULL,
    `receipt_url` LONGTEXT NULL,
    `approved_by` VARCHAR(128) NOT NULL,
    `recorded_by` VARCHAR(128) NULL,
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `central_expenses_expense_no_key`(`expense_no`),
    INDEX `central_expenses_created_at_idx`(`created_at`),
    INDEX `central_expenses_date_idx`(`date`),
    INDEX `central_expenses_category_idx`(`category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `module` VARCHAR(64) NOT NULL,
    `action` VARCHAR(128) NOT NULL,
    `details` TEXT NOT NULL,
    `user_id` VARCHAR(191) NULL,
    `user_email` VARCHAR(128) NOT NULL,
    `user_role` VARCHAR(64) NOT NULL,
    `store_code` VARCHAR(16) NOT NULL,
    `ip_address` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_module_idx`(`module`),
    INDEX `audit_logs_user_email_idx`(`user_email`),
    INDEX `audit_logs_created_at_idx`(`created_at`),
    INDEX `audit_logs_store_code_idx`(`store_code`),
    INDEX `audit_logs_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `branding_settings` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'cosko_branding_config',
    `app_name` VARCHAR(128) NOT NULL DEFAULT 'RISMOS',
    `logo_url` LONGTEXT NULL,
    `logo_dark_url` LONGTEXT NULL,
    `app_icon_url` LONGTEXT NULL,
    `favicon_url` LONGTEXT NULL,
    `tagline` VARCHAR(255) NOT NULL DEFAULT 'Run Retail. Smarter.',
    `primary_color` VARCHAR(32) NULL DEFAULT '#002E86',
    `secondary_color` VARCHAR(32) NULL DEFAULT '#009ADF',
    `accent_color` VARCHAR(32) NULL DEFAULT '#2563EB',
    `support_email` VARCHAR(128) NOT NULL DEFAULT 'support@rismos.com',
    `support_phone` VARCHAR(32) NULL,
    `business_name` VARCHAR(255) NULL,
    `business_address` TEXT NULL,
    `city` VARCHAR(64) NULL,
    `state` VARCHAR(64) NULL,
    `pincode` VARCHAR(32) NULL,
    `country` VARCHAR(64) NULL DEFAULT 'India',
    `country_code` VARCHAR(8) NULL DEFAULT 'IN',
    `timezone` VARCHAR(64) NULL DEFAULT 'Asia/Kolkata',
    `locale` VARCHAR(16) NULL DEFAULT 'en-IN',
    `base_currency` VARCHAR(32) NOT NULL DEFAULT 'INR (Ôé╣)',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_settings` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'cosko_system_config',
    `country_code` VARCHAR(8) NULL DEFAULT 'IN',
    `currency_code` VARCHAR(8) NULL DEFAULT 'INR',
    `currency_symbol` VARCHAR(8) NULL DEFAULT 'Ôé╣',
    `tax_regime` VARCHAR(32) NULL DEFAULT 'GST',
    `tax_inclusive_pricing` BOOLEAN NOT NULL DEFAULT false,
    `tax_registration_number` VARCHAR(64) NULL,
    `tax_jurisdiction_state` VARCHAR(64) NULL,
    `jurisdiction_config` TEXT NULL,
    `tax_config_version` INTEGER NOT NULL DEFAULT 1,
    `gstin` VARCHAR(32) NULL,
    `legal_business_name` VARCHAR(255) NULL,
    `trade_name` VARCHAR(255) NULL,
    `gst_state` VARCHAR(64) NULL,
    `gst_state_code` VARCHAR(16) NULL,
    `gst_registration_type` VARCHAR(32) NOT NULL DEFAULT 'Regular',
    `default_tax_rate` DECIMAL(5, 2) NOT NULL DEFAULT 18,
    `hsn_mandatory` BOOLEAN NOT NULL DEFAULT false,
    `enable_reverse_charge` BOOLEAN NOT NULL DEFAULT false,
    `gst_business_address` TEXT NULL,
    `invoice_header` VARCHAR(255) NOT NULL DEFAULT 'RISMOS Retail Enterprise',
    `invoice_footer` VARCHAR(500) NOT NULL DEFAULT 'Thank you for shopping with us! Goods once sold cannot be returned without original receipt.',
    `invoice_terms` TEXT NULL,
    `invoice_accent_color` VARCHAR(32) NOT NULL DEFAULT 'primary',
    `watermark_opacity` INTEGER NOT NULL DEFAULT 5,
    `show_store_address` BOOLEAN NOT NULL DEFAULT true,
    `invoice_template_url` LONGTEXT NULL,
    `invoice_template_version` INTEGER NOT NULL DEFAULT 1,
    `invoice_field_mapping` TEXT NULL,
    `show_payment_qr` BOOLEAN NOT NULL DEFAULT false,
    `payment_upi_id` VARCHAR(128) NULL,
    `payment_bank_details` TEXT NULL,
    `session_timeout_mins` INTEGER NOT NULL DEFAULT 43200,
    `max_login_attempts` INTEGER NOT NULL DEFAULT 5,
    `enforce_password_policy` BOOLEAN NOT NULL DEFAULT true,
    `sensitive_action_confirm` BOOLEAN NOT NULL DEFAULT true,
    `low_stock_alerts` BOOLEAN NOT NULL DEFAULT true,
    `low_stock_threshold` INTEGER NOT NULL DEFAULT 5,
    `overdue_payment_alerts` BOOLEAN NOT NULL DEFAULT true,
    `overdue_threshold_days` INTEGER NOT NULL DEFAULT 30,
    `daily_sales_digest` BOOLEAN NOT NULL DEFAULT false,
    `security_event_alerts` BOOLEAN NOT NULL DEFAULT true,
    `alert_recipient_emails` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `financial_ledger` (
    `id` VARCHAR(191) NOT NULL,
    `entry_no` VARCHAR(64) NOT NULL,
    `entry_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `store_code` VARCHAR(16) NOT NULL,
    `account_category` VARCHAR(32) NOT NULL,
    `account_name` VARCHAR(64) NOT NULL,
    `debit` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `credit` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `amount` DECIMAL(15, 2) NOT NULL,
    `ref_type` VARCHAR(32) NOT NULL,
    `ref_id` VARCHAR(64) NULL,
    `ref_no` VARCHAR(64) NOT NULL,
    `entity_name` VARCHAR(128) NULL,
    `description` VARCHAR(255) NOT NULL,
    `is_eliminated` BOOLEAN NOT NULL DEFAULT false,
    `metadata_json` TEXT NULL,
    `currency_code` VARCHAR(8) NOT NULL DEFAULT 'INR',
    `created_by` VARCHAR(128) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `financial_ledger_entry_no_key`(`entry_no`),
    INDEX `financial_ledger_store_code_idx`(`store_code`),
    INDEX `financial_ledger_entry_date_idx`(`entry_date`),
    INDEX `financial_ledger_account_category_idx`(`account_category`),
    INDEX `financial_ledger_ref_type_idx`(`ref_type`),
    INDEX `financial_ledger_ref_no_idx`(`ref_no`),
    INDEX `financial_ledger_store_code_entry_date_idx`(`store_code`, `entry_date`),
    INDEX `financial_ledger_account_category_entry_date_idx`(`account_category`, `entry_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `idempotency_records` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(128) NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'PROCESSING',
    `response_code` INTEGER NULL,
    `response_data` LONGTEXT NULL,
    `entity_id` VARCHAR(64) NULL,
    `user_id` VARCHAR(64) NULL,
    `store_code` VARCHAR(16) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `idempotency_records_key_key`(`key`),
    INDEX `idempotency_records_key_idx`(`key`),
    INDEX `idempotency_records_action_idx`(`action`),
    INDEX `idempotency_records_status_idx`(`status`),
    INDEX `idempotency_records_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_methods` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(64) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `type` VARCHAR(32) NOT NULL DEFAULT 'Digital',
    `description` VARCHAR(255) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'Active',
    `is_system` BOOLEAN NOT NULL DEFAULT false,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `payment_methods_name_key`(`name`),
    UNIQUE INDEX `payment_methods_code_key`(`code`),
    INDEX `payment_methods_status_idx`(`status`),
    INDEX `payment_methods_sort_order_idx`(`sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `brands` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(64) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `description` VARCHAR(255) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'Active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `brands_name_key`(`name`),
    UNIQUE INDEX `brands_code_key`(`code`),
    INDEX `brands_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `units` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(64) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `symbol` VARCHAR(16) NOT NULL DEFAULT 'pcs',
    `description` VARCHAR(255) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'Active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `units_name_key`(`name`),
    UNIQUE INDEX `units_code_key`(`code`),
    INDEX `units_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance_days` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `local_date` VARCHAR(10) NOT NULL,
    `store_code` VARCHAR(16) NOT NULL,
    `shift_start_utc` DATETIME(3) NOT NULL,
    `shift_end_utc` DATETIME(3) NULL,
    `total_seconds` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `attendance_days_store_code_idx`(`store_code`),
    INDEX `attendance_days_local_date_idx`(`local_date`),
    INDEX `attendance_days_status_idx`(`status`),
    INDEX `attendance_days_user_id_store_code_idx`(`user_id`, `store_code`),
    UNIQUE INDEX `attendance_days_user_id_local_date_key`(`user_id`, `local_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `delete_requests` (
    `id` VARCHAR(191) NOT NULL,
    `requester_id` VARCHAR(191) NOT NULL,
    `requester_role` VARCHAR(32) NOT NULL,
    `requester_store` VARCHAR(16) NOT NULL,
    `entity_type` VARCHAR(32) NOT NULL,
    `entity_id` VARCHAR(64) NOT NULL,
    `entity_name` VARCHAR(255) NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `before_state_json` LONGTEXT NOT NULL,
    `dependency_impact` TEXT NULL,
    `financial_impact` TEXT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `execution_mode` VARCHAR(16) NULL,
    `reviewed_by` VARCHAR(128) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `rejection_reason` VARCHAR(500) NULL,
    `audit_log_id` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `delete_requests_requester_id_idx`(`requester_id`),
    INDEX `delete_requests_status_idx`(`status`),
    INDEX `delete_requests_entity_type_idx`(`entity_type`),
    INDEX `delete_requests_created_at_idx`(`created_at`),
    UNIQUE INDEX `delete_requests_entity_type_entity_id_status_key`(`entity_type`, `entity_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `message` TEXT NOT NULL,
    `type` VARCHAR(16) NOT NULL DEFAULT 'info',
    `category` VARCHAR(32) NOT NULL DEFAULT 'SYSTEM',
    `related_entity_type` VARCHAR(32) NULL,
    `related_entity_id` VARCHAR(64) NULL,
    `action_url` VARCHAR(255) NULL,
    `is_read` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_user_id_idx`(`user_id`),
    INDEX `notifications_user_id_is_read_idx`(`user_id`, `is_read`),
    INDEX `notifications_category_idx`(`category`),
    INDEX `notifications_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `file_assets` (
    `id` VARCHAR(191) NOT NULL,
    `object_key` VARCHAR(512) NOT NULL,
    `storage_provider` VARCHAR(32) NOT NULL DEFAULT 's3',
    `mime_type` VARCHAR(128) NOT NULL,
    `byte_size` INTEGER NOT NULL,
    `sha256_hash` VARCHAR(64) NULL,
    `original_filename` VARCHAR(255) NOT NULL,
    `created_by_user_id` VARCHAR(191) NOT NULL,
    `store_code` VARCHAR(16) NULL,
    `related_entity_type` VARCHAR(32) NULL,
    `related_entity_id` VARCHAR(64) NULL,
    `privacy_level` VARCHAR(32) NOT NULL DEFAULT 'STORE_PRIVATE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `file_assets_object_key_key`(`object_key`),
    INDEX `file_assets_store_code_idx`(`store_code`),
    INDEX `file_assets_related_entity_type_related_entity_id_idx`(`related_entity_type`, `related_entity_id`),
    INDEX `file_assets_created_by_user_id_idx`(`created_by_user_id`),
    INDEX `file_assets_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `realtime_outbox` (
    `id` VARCHAR(191) NOT NULL,
    `channel` VARCHAR(64) NOT NULL,
    `event` VARCHAR(64) NOT NULL,
    `payload` TEXT NOT NULL,
    `store_code` VARCHAR(16) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processed_at` DATETIME(3) NULL,

    INDEX `realtime_outbox_channel_idx`(`channel`),
    INDEX `realtime_outbox_store_code_idx`(`store_code`),
    INDEX `realtime_outbox_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_presence` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'OFFLINE',
    `last_heartbeat` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_seen` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `current_store` VARCHAR(16) NULL,
    `device_info` VARCHAR(255) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `user_presence_user_id_key`(`user_id`),
    INDEX `user_presence_status_idx`(`status`),
    INDEX `user_presence_last_heartbeat_idx`(`last_heartbeat`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sequence_counters` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `prefix` VARCHAR(32) NOT NULL,
    `current_value` BIGINT NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sequence_counters_prefix_key`(`prefix`),
    INDEX `sequence_counters_prefix_idx`(`prefix`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `password_resets` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `token` VARCHAR(128) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `ip_address` VARCHAR(64) NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `password_resets_token_key`(`token`),
    INDEX `password_resets_user_id_idx`(`user_id`),
    INDEX `password_resets_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_ui_preferences` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `preferences_json` TEXT NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `user_ui_preferences_user_id_key`(`user_id`),
    INDEX `user_ui_preferences_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_permission_overrides` ADD CONSTRAINT `user_permission_overrides_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_sessions` ADD CONSTRAINT `user_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_store_assignments` ADD CONSTRAINT `user_store_assignments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `categories` ADD CONSTRAINT `categories_parent_category_id_fkey` FOREIGN KEY (`parent_category_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory` ADD CONSTRAINT `inventory_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_ledger` ADD CONSTRAINT `inventory_ledger_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_transfer_items` ADD CONSTRAINT `stock_transfer_items_transfer_id_fkey` FOREIGN KEY (`transfer_id`) REFERENCES `stock_transfers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_transfer_items` ADD CONSTRAINT `stock_transfer_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_store_profiles` ADD CONSTRAINT `customer_store_profiles_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_external_links` ADD CONSTRAINT `customer_external_links_cosko_customer_id_fkey` FOREIGN KEY (`cosko_customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `repair_enquiries` ADD CONSTRAINT `repair_enquiries_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchases` ADD CONSTRAINT `purchases_vendor_id_fkey` FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_payments` ADD CONSTRAINT `purchase_payments_purchase_id_fkey` FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `goods_received_notes` ADD CONSTRAINT `goods_received_notes_purchase_id_fkey` FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_items` ADD CONSTRAINT `purchase_items_po_id_fkey` FOREIGN KEY (`po_id`) REFERENCES `purchases`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_items` ADD CONSTRAINT `purchase_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales` ADD CONSTRAINT `sales_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_items` ADD CONSTRAINT `sale_items_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `sales`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_items` ADD CONSTRAINT `sale_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_days` ADD CONSTRAINT `attendance_days_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delete_requests` ADD CONSTRAINT `delete_requests_requester_id_fkey` FOREIGN KEY (`requester_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file_assets` ADD CONSTRAINT `file_assets_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_presence` ADD CONSTRAINT `user_presence_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `password_resets` ADD CONSTRAINT `password_resets_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_ui_preferences` ADD CONSTRAINT `user_ui_preferences_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

