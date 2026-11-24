<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);

/**
 * Server-side icon helper for PHP projects.
 *
 *   RemoteIcon::configure('https://icons.example.com', __DIR__ . '/cache/icons', __DIR__ . '/public/icons');
 *   echo RemoteIcon::svg('home');
 *   echo RemoteIcon::svg('github', ['set' => 'social', 'size' => 20, 'class' => 'me-1']);
 *
 * Icons are cached on disk, so the service is only contacted when a file is missing or
 * older than $ttl. If the service is down the stale copy is used, then the optional
 * local fallback folder (a checkout of the icon repo: <dir>/ui/home.svg).
 *
 * Freshness: at most every $checkEvery seconds (default 5 minutes) the service's /api/manifest is compared with
 * the last one seen. New icons need no action (they are fetched the first time they are asked for), and an icon
 * whose content changed is re-downloaded on its next use. An icon that was removed from the service keeps
 * being served from your cache.
 */
final class RemoteIcon
{
    private static string $base = '';
    private static string $cacheDir = '';
    private static ?string $fallbackDir = null;
    private static int $ttl = 86400;
    private static int $checkEvery = 300;
    private static bool $checked = false;

    public static function configure(string $baseUrl, string $cacheDir, ?string $fallbackDir = null, int $ttl = 86400, int $checkEvery = 300): void
    {
        self::$checkEvery = max(0, $checkEvery);
        self::$checked = false;
        self::$base = rtrim($baseUrl, '/');
        self::$cacheDir = rtrim($cacheDir, '/');
        self::$fallbackDir = $fallbackDir !== null ? rtrim($fallbackDir, '/') : null;
        self::$ttl = $ttl;
    }

    /** @param array{set?:string,size?:int|string,stroke?:float|int|string,class?:string,label?:string} $opt */
    public static function svg(string $name, array $opt = []): string
    {
        $set = $opt['set'] ?? 'ui';
        if (!preg_match('/^[a-z0-9][a-z0-9-]{0,63}$/', $name) || !preg_match('/^[a-z0-9-]{1,32}$/', $set)) {
            return '';
        }
        $svg = self::load($set, $name);
        if ($svg === null) {
            return '';
        }
        $tag = null;
        if (preg_match('/<svg\b[^>]*>/', $svg, $m)) {
            $tag = $m[0];
        }
        if ($tag === null) {
            return '';
        }
        $new = $tag;
        foreach (['size' => ['width', 'height'], 'stroke' => ['stroke-width']] as $key => $attrs) {
            if (!isset($opt[$key]) || !is_numeric($opt[$key])) {
                continue;
            }
            foreach ($attrs as $a) {
                $new = self::attr($new, $a, (string) $opt[$key]);
            }
        }
        if (!empty($opt['class'])) {
            $new = self::attr($new, 'class', htmlspecialchars((string) $opt['class'], ENT_QUOTES));
        }
        if (!empty($opt['label'])) {
            $new = self::attr($new, 'role', 'img');
            $new = self::attr($new, 'aria-label', htmlspecialchars((string) $opt['label'], ENT_QUOTES));
        } else {
            $new = self::attr($new, 'aria-hidden', 'true');
        }
        return str_replace($tag, $new, $svg);
    }

    private static function attr(string $tag, string $name, string $value): string
    {
        $re = '/(\s' . preg_quote($name, '/') . '=)"[^"]*"/';
        if (preg_match($re, $tag)) {
            return preg_replace($re, '$1"' . $value . '"', $tag, 1);
        }
        return preg_replace('/>$/', ' ' . $name . '="' . $value . '">', $tag, 1);
    }

    /** Compare the service's manifest with the last one seen and expire cached icons whose content changed. */
    private static function checkForChanges(): void
    {
        if (self::$checked || self::$base === '' || self::$checkEvery === 0) {
            return;
        }
        self::$checked = true; // once per request
        $idx = self::$cacheDir . '/.manifest.json';
        $prev = is_file($idx) ? json_decode((string) file_get_contents($idx), true) : null;
        if (is_array($prev) && time() - (int) ($prev['t'] ?? 0) < self::$checkEvery) {
            return;
        }
        $ctx = stream_context_create(['http' => ['timeout' => 2.0, 'ignore_errors' => true, 'header' => "Accept: application/json\r\n"]]);
        $body = @file_get_contents(self::$base . '/api/manifest', false, $ctx);
        $m = is_string($body) ? json_decode($body, true) : null;
        $hashes = is_array($prev['hashes'] ?? null) ? $prev['hashes'] : [];
        if (is_array($m) && is_array($m['icons'] ?? null)) {
            $now = [];
            foreach ($m['icons'] as $i) {
                if (isset($i['set'], $i['name'], $i['hash'])) {
                    $now[$i['set'] . '/' . $i['name']] = (string) $i['hash'];
                }
            }
            foreach ($now as $key => $hash) {
                $file = self::$cacheDir . '/' . str_replace('/', '-', $key) . '.svg';
                // first check (no previous manifest) or changed content: expire it so the next use re-downloads
                if (is_file($file) && (!is_array($prev) || ($hashes[$key] ?? null) !== $hash)) {
                    @touch($file, 1);
                }
            }
            $hashes = $now + array_diff_key($hashes, $now); // removed icons stay remembered, their cached files stay in use
        }
        // Record the attempt even when the service is down, so a slow or dead service is not retried on every request.
        if (!is_dir(self::$cacheDir)) {
            @mkdir(self::$cacheDir, 0775, true);
        }
        $tmp = $idx . '.' . bin2hex(random_bytes(4)) . '.tmp';
        if (@file_put_contents($tmp, json_encode(['t' => time(), 'hashes' => $hashes])) !== false) {
            @rename($tmp, $idx);
        }
    }

    private static function load(string $set, string $name): ?string
    {
        self::checkForChanges();
        $file = self::$cacheDir . "/$set-$name.svg";
        if (is_file($file) && time() - (int) filemtime($file) < self::$ttl) {
            return (string) file_get_contents($file);
        }
        $ctx = stream_context_create(['http' => ['timeout' => 2.0, 'ignore_errors' => true, 'header' => "Accept: image/svg+xml\r\n"]]);
        $body = self::$base !== '' ? @file_get_contents(self::$base . "/i/$set/$name.svg", false, $ctx) : false;
        $ok = is_string($body) && str_starts_with(ltrim($body), '<svg') && !str_contains($body, '<script');
        if ($ok) {
            if (!is_dir(self::$cacheDir)) {
                @mkdir(self::$cacheDir, 0775, true);
            }
            $tmp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
            if (@file_put_contents($tmp, $body) !== false) {
                @rename($tmp, $file);
            }
            return $body;
        }
        if (is_file($file)) {
            @touch($file, time() - self::$ttl + 60); // stale beats nothing; try the service again in a minute
            return (string) file_get_contents($file);
        }
        if (self::$fallbackDir !== null && is_file(self::$fallbackDir . "/$set/$name.svg")) {
            return (string) file_get_contents(self::$fallbackDir . "/$set/$name.svg");
        }
        return null;
    }
}
