-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "feed_tags" (
    "feed_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    CONSTRAINT "feed_tags_feed_id_fkey" FOREIGN KEY ("feed_id") REFERENCES "feeds" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "feed_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY ("feed_id", "tag_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");
