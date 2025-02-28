#!/bin/sh

yarn install --frozen-lockfile
yarn prisma:generate
