process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://smis:smis_dev_pw@localhost:5432/smis_test";
process.env.DIRECT_URL = process.env.DATABASE_URL;
