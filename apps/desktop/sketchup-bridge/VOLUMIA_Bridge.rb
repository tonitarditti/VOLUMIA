# frozen_string_literal: true

# VOLUMIA Bridge 1.0.0
# Imports VOLUMIA's local manifest so each disconnected Blender piece becomes a
# real SketchUp group even when SketchUp flattens a Collada scene hierarchy.

require "sketchup.rb"
require "json"
require "fileutils"
require "time"

module VOLUMIA
  module Bridge
    NAME = "VOLUMIA Bridge"
    VERSION = "1.0.0"

    def self.status_path
      local_app_data = ENV["LOCALAPPDATA"] || ENV["APPDATA"]
      return nil unless local_app_data

      File.join(local_app_data, "VOLUMIA", "sketchup-bridge-status.json")
    end

    def self.report_status(error = nil, imported_pieces = nil)
      path = status_path
      return unless path

      FileUtils.mkdir_p(File.dirname(path))
      File.write(path, JSON.generate({
        bridge: NAME,
        version: VERSION,
        loaded: error.nil?,
        error: error,
        importedPieces: imported_pieces,
        checkedAt: Time.now.utc.iso8601
      }))
    rescue StandardError
      # The extension must remain usable if Windows blocks the optional status file.
    end

    def self.import_dae
      selected_path = UI.openpanel("Importar activo de VOLUMIA", "", "Activos VOLUMIA|*.dae;*.glb||")
      return unless selected_path

      manifest = resolve_manifest(selected_path)
      dae_path = resolve_dae_path(selected_path, manifest)
      unless dae_path
        UI.messagebox("No se encontró el DAE asociado. Prepará el activo en VOLUMIA antes de abrirlo en SketchUp.")
        return
      end

      model = Sketchup.active_model
      model.start_operation("Importar activo VOLUMIA", true)
      pieces = manifest.is_a?(Hash) ? manifest["pieces"] : nil
      imported_count = import_manifest_pieces(model, manifest, pieces) if pieces.is_a?(Array) && !pieces.empty?
      imported_count ||= import_single_dae(model, dae_path) ? 1 : 0
      if imported_count.zero?
        model.abort_operation
        UI.messagebox("VOLUMIA Bridge no pudo importar el archivo DAE seleccionado.")
        return
      end
      model.commit_operation
      report_status(nil, imported_count)
      UI.messagebox("Activo VOLUMIA importado en #{imported_count} grupo(s). Usá Archivo > Guardar para crear el .skp.")
    rescue StandardError => error
      model.abort_operation if defined?(model) && model
      report_status(error.message)
      UI.messagebox("VOLUMIA Bridge: #{error.message}")
    end

    def self.resolve_manifest(selected_path)
      candidate = File.join(File.dirname(selected_path), "asset.volumia.json")
      return nil unless File.file?(candidate)

      data = JSON.parse(File.read(candidate))
      data["__path"] = candidate
      data
    rescue JSON::ParserError
      nil
    end

    def self.resolve_dae_path(selected_path, manifest = nil)
      return selected_path if File.extname(selected_path).downcase == ".dae"

      candidate = File.join(File.dirname(selected_path), manifest.dig("files", "dae") || "asset.dae") if manifest
      return candidate if candidate && File.file?(candidate)

      candidate = File.join(File.dirname(selected_path), "asset.dae")
      File.file?(candidate) ? candidate : nil
    end

    def self.import_single_dae(model, dae_path)
      model.import(dae_path)
    end

    def self.import_manifest_pieces(model, manifest, pieces)
      imported_count = 0
      pieces.each do |piece|
        relative_path = piece["daeFile"]
        next unless relative_path

        piece_path = File.expand_path(relative_path, File.dirname(manifest["__path"]))
        next unless File.file?(piece_path)

        before = model.entities.to_a
        next unless model.import(piece_path)

        created = model.entities.to_a - before
        next if created.empty?

        group = model.entities.add_group(created)
        group.name = piece["name"] || "Pieza"
        imported_count += 1
      end
      imported_count
    end

    unless file_loaded?(__FILE__)
      command = UI::Command.new("Importar DAE de VOLUMIA") { import_dae }
      command.tooltip = "Importar un activo DAE exportado por VOLUMIA"
      UI.menu("Extensions").add_item(command)
      report_status
      file_loaded(__FILE__)
    end
  end
end
